"""
Compare priority-prediction models against human ratings.

Runs on numpy only (scipy/sklearn DLLs are blocked by machine policy), so the
estimators are implemented here: ridge, elastic net, ordinal logistic,
gradient-boosted trees, and binary logistic.

    python scripts/priority-eval/analyze.py
"""

import json
import sys
from dataclasses import dataclass

import numpy as np
import pandas as pd

RNG = np.random.default_rng(20260804)
CSV = "scripts/priority-eval/data/priority-dataset.csv"
HIGH = 7  # "worth surfacing" threshold
TOPK = 10

FEATURES = [
    "stewardshipTitle", "stewardshipAbstract", "largeStudy", "extraTerms",
    "studyBoostFactor", "jifNorm", "isQ1", "isRct", "isSystematicReview",
    "isCohort", "isMulticenter", "clinicalStewardship", "novelty",
    "intervention", "guideline", "nonHumanOnly", "clinicalBonusNorm",
    "logAbstractWords", "keywordCountNorm",
]

FLAGS = [
    "Q1_journal", "RCT", "Systematic_review", "Multicenter",
    "Clinical_stewardship", "Novelty", "Cohort", "Intervention",
    "Guideline", "Non-human_only",
]


# ────────────────────────── metrics ──────────────────────────

def rankdata(a):
    a = np.asarray(a, float)
    n = a.size
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(n, float)
    sa = a[order]
    i = 0
    while i < n:
        j = i
        while j + 1 < n and sa[j + 1] == sa[i]:
            j += 1
        ranks[order[i:j + 1]] = 0.5 * (i + j) + 1.0
        i = j + 1
    return ranks


def spearman(x, y):
    rx, ry = rankdata(x), rankdata(y)
    rx = rx - rx.mean()
    ry = ry - ry.mean()
    den = np.sqrt((rx * rx).sum() * (ry * ry).sum())
    return float((rx * ry).sum() / den) if den > 0 else 0.0


def auc_binary(ybin, score):
    npos = int(ybin.sum())
    nneg = int(len(ybin) - npos)
    if npos == 0 or nneg == 0:
        return np.nan
    r = rankdata(score)
    return float((r[ybin == 1].sum() - npos * (npos + 1) / 2) / (npos * nneg))


def _topk_idx(score, k, rng):
    """Argsort with random tie-breaking so tied heuristic scores aren't
    silently ordered by row position."""
    jitter = rng.random(len(score)) * 1e-9
    return np.argsort(-(score + jitter), kind="mergesort")[:k]


def ndcg_at_k(y, score, k, rng):
    k = min(k, len(y))
    if k == 0:
        return np.nan
    idx = _topk_idx(score, k, rng)
    disc = 1.0 / np.log2(np.arange(2, k + 2))
    dcg = ((2.0 ** y[idx] - 1) * disc).sum()
    ideal = np.sort(y)[::-1][:k]
    idcg = ((2.0 ** ideal - 1) * disc).sum()
    return float(dcg / idcg) if idcg > 0 else np.nan


def precision_at_k(y, score, k, rng):
    k = min(k, len(y))
    idx = _topk_idx(score, k, rng)
    return float((y[idx] >= HIGH).mean())


def topk_mean(y, score, k, rng):
    k = min(k, len(y))
    idx = _topk_idx(score, k, rng)
    return float(y[idx].mean())


def evaluate(y, score, rng, pred_value=None):
    return {
        "spearman": spearman(score, y),
        "auc7": auc_binary((y >= HIGH).astype(int), score),
        "ndcg10": ndcg_at_k(y, score, TOPK, rng),
        "p@10": precision_at_k(y, score, TOPK, rng),
        "top10_mean": topk_mean(y, score, TOPK, rng),
        "mae": float(np.abs(pred_value - y).mean()) if pred_value is not None else np.nan,
    }


# ────────────────────────── estimators ──────────────────────────

def _standardize(X):
    mu = X.mean(0)
    sd = X.std(0)
    sd[sd < 1e-8] = 1.0
    return mu, sd


class Ridge:
    """Matches production trainPriorityModel (population std, lambda on X'X)."""

    def __init__(self, lam=1.5):
        self.lam = lam

    def fit(self, X, y):
        self.mu, self.sd = _standardize(X)
        Z = np.hstack([(X - self.mu) / self.sd, np.ones((len(X), 1))])
        p = X.shape[1]
        A = Z.T @ Z
        A[:p, :p] += self.lam * np.eye(p)
        self.coef = np.linalg.solve(A, Z.T @ y)
        return self

    def predict(self, X):
        Z = (X - self.mu) / self.sd
        return Z @ self.coef[:-1] + self.coef[-1]


class ElasticNet:
    def __init__(self, alpha=0.1, l1_ratio=0.5, iters=300):
        self.alpha, self.l1_ratio, self.iters = alpha, l1_ratio, iters

    def fit(self, X, y):
        self.mu, self.sd = _standardize(X)
        Z = (X - self.mu) / self.sd
        self.ybar = y.mean()
        r = y - self.ybar
        n, p = Z.shape
        beta = np.zeros(p)
        l1 = self.alpha * self.l1_ratio
        l2 = self.alpha * (1 - self.l1_ratio)
        resid = r.copy()
        for _ in range(self.iters):
            delta = 0.0
            for j in range(p):
                if beta[j] != 0:
                    resid += Z[:, j] * beta[j]
                rho = Z[:, j] @ resid / n
                new = np.sign(rho) * max(abs(rho) - l1, 0.0) / (1.0 + l2)
                if new != 0:
                    resid -= Z[:, j] * new
                delta = max(delta, abs(new - beta[j]))
                beta[j] = new
            if delta < 1e-6:
                break
        self.beta = beta
        return self

    def predict(self, X):
        return ((X - self.mu) / self.sd) @ self.beta + self.ybar


def _sigmoid(z):
    return 0.5 * (1.0 + np.tanh(0.5 * z))


class LogisticL2:
    """Newton/IRLS binary logistic with ridge penalty."""

    def __init__(self, lam=1.0, iters=50):
        self.lam, self.iters = lam, iters

    def fit(self, X, y):
        self.mu, self.sd = _standardize(X)
        Z = np.hstack([(X - self.mu) / self.sd, np.ones((len(X), 1))])
        p = X.shape[1]
        w = np.zeros(p + 1)
        pen = self.lam * np.eye(p + 1)
        pen[p, p] = 0.0
        for _ in range(self.iters):
            eta = Z @ w
            mu = _sigmoid(eta)
            s = np.clip(mu * (1 - mu), 1e-6, None)
            H = Z.T @ (Z * s[:, None]) + pen
            g = Z.T @ (y - mu) - pen @ w
            try:
                step = np.linalg.solve(H, g)
            except np.linalg.LinAlgError:
                break
            w += step
            if np.abs(step).max() < 1e-8:
                break
        self.w = w
        return self

    def decision(self, X):
        Z = np.hstack([(X - self.mu) / self.sd, np.ones((len(X), 1))])
        return Z @ self.w


class OrdinalLogistic:
    """Proportional-odds model, Adam on the exact gradient."""

    def __init__(self, lam=1.0, steps=800, lr=0.08):
        self.lam, self.steps, self.lr = lam, steps, lr

    def fit(self, X, y):
        self.mu, self.sd = _standardize(X)
        Z = (X - self.mu) / self.sd
        self.levels = np.unique(y)
        K = len(self.levels)
        idx = np.searchsorted(self.levels, y)
        n, p = Z.shape
        # theta_0 = t0; theta_j = t0 + cumsum(softplus(d))
        params = np.concatenate([np.zeros(p), [-1.0], np.zeros(max(K - 2, 0))])

        def unpack(par):
            beta = par[:p]
            t0 = par[p]
            d = par[p + 1:]
            sp = np.log1p(np.exp(np.clip(d, -30, 30)))
            theta = np.concatenate([[t0], t0 + np.cumsum(sp)]) if len(d) else np.array([t0])
            return beta, theta, d, sp

        m = np.zeros_like(params)
        v = np.zeros_like(params)
        for step in range(1, self.steps + 1):
            beta, theta, d, sp = unpack(params)
            eta = Z @ beta
            th_hi = np.where(idx < K - 1, theta[np.minimum(idx, K - 2)], np.inf)
            th_lo = np.where(idx > 0, theta[np.maximum(idx - 1, 0)], -np.inf)
            s_hi = np.where(np.isinf(th_hi), 1.0, _sigmoid(th_hi - eta))
            s_lo = np.where(np.isinf(th_lo), 0.0, _sigmoid(th_lo - eta))
            pk = np.clip(s_hi - s_lo, 1e-9, None)
            d_hi = s_hi * (1 - s_hi)
            d_lo = s_lo * (1 - s_lo)
            # d log p / d eta
            g_eta = (-d_hi + d_lo) / pk
            grad_beta = -(Z.T @ g_eta) + self.lam * beta
            grad_theta = np.zeros(K - 1)
            if K > 1:
                np.add.at(grad_theta, np.minimum(idx, K - 2)[idx < K - 1],
                          -(d_hi / pk)[idx < K - 1])
                np.add.at(grad_theta, np.maximum(idx - 1, 0)[idx > 0],
                          (d_lo / pk)[idx > 0])
            grad_t0 = grad_theta.sum()
            grad_d = np.zeros(max(K - 2, 0))
            if len(grad_d):
                # theta_j depends on softplus(d_i) for i < j
                tail = np.cumsum(grad_theta[::-1])[::-1]
                grad_d = tail[1:] * _sigmoid(np.clip(d, -30, 30))
            g = np.concatenate([grad_beta, [grad_t0], grad_d])
            m = 0.9 * m + 0.1 * g
            v = 0.999 * v + 0.001 * g * g
            mh = m / (1 - 0.9 ** step)
            vh = v / (1 - 0.999 ** step)
            params -= self.lr * mh / (np.sqrt(vh) + 1e-8)

        self.beta, self.theta, _, _ = unpack(params)
        return self

    def decision(self, X):
        return ((X - self.mu) / self.sd) @ self.beta

    def expected(self, X):
        eta = self.decision(X)
        cum = _sigmoid(self.theta[None, :] - eta[:, None])
        probs = np.diff(np.hstack([np.zeros((len(eta), 1)), cum, np.ones((len(eta), 1))]), axis=1)
        return probs @ self.levels


class GBT:
    """Gradient-boosted regression trees on quantile-binned features."""

    def __init__(self, n_trees=200, lr=0.05, max_depth=3, min_leaf=20,
                 nbins=32, l2=1.0, subsample=0.8, seed=0):
        self.n_trees, self.lr, self.max_depth = n_trees, lr, max_depth
        self.min_leaf, self.nbins, self.l2 = min_leaf, nbins, l2
        self.subsample, self.seed = subsample, seed

    def _bin(self, X):
        return np.stack([
            np.searchsorted(self.edges[j], X[:, j], side="left")
            for j in range(X.shape[1])
        ], axis=1).astype(np.int32)

    def fit(self, X, y):
        p = X.shape[1]
        qs = np.linspace(0, 1, self.nbins + 1)[1:-1]
        self.edges = [np.unique(np.quantile(X[:, j], qs)) for j in range(p)]
        Xb = self._bin(X)
        self.nb = [len(e) + 1 for e in self.edges]
        self.base = float(y.mean())
        resid = y - self.base
        rng = np.random.default_rng(self.seed)
        self.trees = []
        n = len(y)
        for _ in range(self.n_trees):
            rows = rng.choice(n, size=int(self.subsample * n), replace=False)
            tree = self._build(Xb, resid, rows, 0)
            self.trees.append(tree)
            resid -= self.lr * self._apply(tree, Xb)
        return self

    def _build(self, Xb, g, rows, depth):
        gs = g[rows]
        if depth >= self.max_depth or len(rows) < 2 * self.min_leaf:
            return {"leaf": float(gs.sum() / (len(rows) + self.l2))}
        tot_g, tot_n = gs.sum(), len(rows)
        parent = tot_g * tot_g / (tot_n + self.l2)
        best = (0.0, None, None)
        for j in range(Xb.shape[1]):
            nb = self.nb[j]
            if nb < 2:
                continue
            col = Xb[rows, j]
            sg = np.bincount(col, weights=gs, minlength=nb)
            sn = np.bincount(col, minlength=nb).astype(float)
            cg, cn = np.cumsum(sg)[:-1], np.cumsum(sn)[:-1]
            rg, rn = tot_g - cg, tot_n - cn
            ok = (cn >= self.min_leaf) & (rn >= self.min_leaf)
            if not ok.any():
                continue
            gain = cg * cg / (cn + self.l2) + rg * rg / (rn + self.l2) - parent
            gain = np.where(ok, gain, -np.inf)
            b = int(np.argmax(gain))
            if gain[b] > best[0]:
                best = (float(gain[b]), j, b)
        if best[1] is None:
            return {"leaf": float(tot_g / (tot_n + self.l2))}
        _, j, b = best
        mask = Xb[rows, j] <= b
        return {
            "f": j, "b": b,
            "l": self._build(Xb, g, rows[mask], depth + 1),
            "r": self._build(Xb, g, rows[~mask], depth + 1),
        }

    def _apply(self, tree, Xb):
        out = np.empty(len(Xb))
        stack = [(tree, np.arange(len(Xb)))]
        while stack:
            node, rows = stack.pop()
            if "leaf" in node:
                out[rows] = node["leaf"]
                continue
            mask = Xb[rows, node["f"]] <= node["b"]
            stack.append((node["l"], rows[mask]))
            stack.append((node["r"], rows[~mask]))
        return out

    def predict(self, X):
        Xb = self._bin(X)
        out = np.full(len(X), self.base)
        for t in self.trees:
            out += self.lr * self._apply(t, Xb)
        return out


# ────────────────────────── model registry ──────────────────────────

@dataclass
class Spec:
    name: str
    kind: str  # "trained" | "fixed"
    build: object = None
    column: str = None
    trainable: bool = True


def model_specs():
    return [
        Spec("Constant (train mean)", "constant"),
        Spec("Heuristic relevance %", "fixed", column="relevance_pct"),
        Spec("fallbackPredictedPriority", "fixed", column="fallback_priority"),
        Spec("Ridge lam=1.5 (production)", "trained", build=lambda: Ridge(1.5)),
        Spec("Ridge lam=20", "trained", build=lambda: Ridge(20.0)),
        Spec("Ridge lam=60", "trained", build=lambda: Ridge(60.0)),
        Spec("ElasticNet a=0.05", "trained", build=lambda: ElasticNet(0.05, 0.5)),
        Spec("Lasso a=0.05", "trained", build=lambda: ElasticNet(0.05, 1.0)),
        Spec("Ordinal logistic", "trained", build=lambda: OrdinalLogistic(2.0)),
        Spec("Logistic P(>=7)", "trained", build=lambda: LogisticL2(5.0)),
        Spec("GBT depth3 x200", "trained", build=lambda: GBT(200, 0.05, 3, 20, seed=1)),
        Spec("GBT depth2 x300", "trained", build=lambda: GBT(300, 0.05, 2, 25, seed=2)),
    ]


def fit_predict(spec, Xtr, ytr, Xte, cols_te):
    """Returns (ranking_score, point_prediction_or_None)."""
    if spec.kind == "constant":
        v = np.full(len(Xte), ytr.mean())
        return v, v
    if spec.kind == "fixed":
        return cols_te[spec.column], (
            cols_te[spec.column] if spec.column == "fallback_priority" else None
        )
    m = spec.build().fit(Xtr, ytr)
    if isinstance(m, LogisticL2):
        return m.decision(Xte), None
    if isinstance(m, OrdinalLogistic):
        return m.decision(Xte), m.expected(Xte)
    pred = m.predict(Xte)
    return pred, np.clip(np.round(pred), 1, 10)


# ────────────────────────── evaluation ──────────────────────────

def kfold_indices(n, k, rng):
    idx = rng.permutation(n)
    return [idx[i::k] for i in range(k)]


def run_cv(df, version, specs, folds=5, repeats=5):
    X = df[[f"{version}__{f}" for f in FEATURES]].to_numpy(float)
    y = df["rating"].to_numpy(float)
    cols = {
        "relevance_pct": df[f"{version}__relevance_pct"].to_numpy(float),
        "fallback_priority": df[f"{version}__fallback_priority"].to_numpy(float),
    }
    n = len(y)
    results = {s.name: [] for s in specs}
    for rep in range(repeats):
        rng = np.random.default_rng(1000 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            cols_te = {k: v[te] for k, v in cols.items()}
            for s in specs:
                score, pred = fit_predict(s, X[tr], y[tr], X[te], cols_te)
                results[s.name].append(evaluate(y[te], score, rng, pred))
    return {
        name: {k: float(np.nanmean([r[k] for r in runs]))
               for k in runs[0]}
        for name, runs in results.items()
    }


def run_time_split(df, version, specs, frac=0.25):
    d = df.sort_values("rated_at").reset_index(drop=True)
    X = d[[f"{version}__{f}" for f in FEATURES]].to_numpy(float)
    y = d["rating"].to_numpy(float)
    cut = int(len(d) * (1 - frac))
    tr, te = np.arange(cut), np.arange(cut, len(d))
    cols_te = {
        "relevance_pct": d[f"{version}__relevance_pct"].to_numpy(float)[te],
        "fallback_priority": d[f"{version}__fallback_priority"].to_numpy(float)[te],
    }
    rng = np.random.default_rng(7)
    out = {}
    for s in specs:
        score, pred = fit_predict(s, X[tr], y[tr], X[te], cols_te)
        out[s.name] = evaluate(y[te], score, rng, pred)
    return out, len(tr), len(te)


def permutation_importance(df, version, build, folds=5, repeats=3):
    X = df[[f"{version}__{f}" for f in FEATURES]].to_numpy(float)
    y = df["rating"].to_numpy(float)
    n, p = X.shape
    drops = np.zeros((0, p))
    for rep in range(repeats):
        rng = np.random.default_rng(500 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            m = build().fit(X[tr], y[tr])
            base = spearman(m.predict(X[te]), y[te])
            row = np.zeros(p)
            for j in range(p):
                Xp = X[te].copy()
                Xp[:, j] = rng.permutation(Xp[:, j])
                row[j] = base - spearman(m.predict(Xp), y[te])
            drops = np.vstack([drops, row])
    return drops.mean(0)


def greedy_forward(df, version, max_feats=10, folds=5, repeats=3):
    X = df[[f"{version}__{f}" for f in FEATURES]].to_numpy(float)
    y = df["rating"].to_numpy(float)
    n = len(y)
    fold_sets = []
    for rep in range(repeats):
        rng = np.random.default_rng(300 + rep)
        fold_sets.extend(kfold_indices(n, folds, rng))

    def score_subset(cols):
        vals = []
        for te in fold_sets:
            tr = np.setdiff1d(np.arange(n), te)
            m = Ridge(5.0).fit(X[np.ix_(tr, cols)], y[tr])
            vals.append(spearman(m.predict(X[np.ix_(te, cols)]), y[te]))
        return float(np.mean(vals))

    chosen, history = [], []
    remaining = list(range(len(FEATURES)))
    while remaining and len(chosen) < max_feats:
        best = max(remaining, key=lambda j: score_subset(chosen + [j]))
        s = score_subset(chosen + [best])
        chosen.append(best)
        remaining.remove(best)
        history.append((FEATURES[best], s))
    return history


# ────────────────────────── reporting ──────────────────────────

def fmt_table(title, rows, cols):
    w0 = max(len(r[0]) for r in rows + [(title, )]) + 2
    head = "  " + "MODEL".ljust(w0) + "".join(c.rjust(11) for c in cols)
    lines = [f"\n{title}", "-" * len(head), head, "-" * len(head)]
    for name, m in rows:
        lines.append("  " + name.ljust(w0) +
                     "".join(("nan" if np.isnan(m[c]) else f"{m[c]:.3f}").rjust(11)
                             for c in cols))
    return "\n".join(lines)


def main():
    df = pd.read_csv(CSV)
    y = df["rating"].to_numpy(float)
    print("=" * 78)
    print(f"PRIORITY MODEL COMPARISON   n={len(df)} rated articles")
    print("=" * 78)

    counts = df["rating"].value_counts().sort_index()
    print("\nRating distribution")
    for k, v in counts.items():
        print(f"  {int(k):>2}: {'#' * int(60 * v / counts.max()):<60} {v}")
    print(f"  mean {y.mean():.2f}   sd {y.std():.2f}   "
          f">= {HIGH}: {(y >= HIGH).sum()} ({(y >= HIGH).mean():.1%})")

    # Flag prevalence and lift, v1 vs v2
    print("\nClinical flag prevalence and mean rating when fired")
    hdr = f"  {'FLAG':<24}{'v1 fires':>10}{'v1 mean':>9}{'v2 fires':>10}{'v2 mean':>9}{'lift v2':>9}"
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    base = y.mean()
    for flag in FLAGS:
        c1 = df[f"v1__flag__{flag}"].to_numpy(bool)
        c2 = df[f"v2__flag__{flag}"].to_numpy(bool)
        m1 = y[c1].mean() if c1.any() else np.nan
        m2 = y[c2].mean() if c2.any() else np.nan
        print(f"  {flag:<24}{c1.mean():>9.1%}{m1:>9.2f}{c2.mean():>10.1%}"
              f"{m2:>9.2f}{(m2 - base):>9.2f}")

    # Univariate association
    print("\nPer-feature Spearman vs rating")
    hdr = f"  {'FEATURE':<24}{'v1':>9}{'v2':>9}{'v1 sd':>9}"
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    for f in FEATURES:
        a = df[f"v1__{f}"].to_numpy(float)
        b = df[f"v2__{f}"].to_numpy(float)
        print(f"  {f:<24}{spearman(a, y):>9.3f}{spearman(b, y):>9.3f}{a.std():>9.3f}")

    specs = model_specs()
    cols = ["spearman", "auc7", "ndcg10", "p@10", "top10_mean", "mae"]

    for version in ("v1", "v2"):
        res = run_cv(df, version, specs)
        rows = sorted(res.items(), key=lambda kv: -kv[1]["spearman"])
        print(fmt_table(
            f"5-fold CV x5 repeats — term set {version.upper()}"
            f"  (baseline top10_mean if random = {y.mean():.2f})",
            rows, cols))

    for version in ("v1", "v2"):
        res, ntr, nte = run_time_split(df, version, specs)
        rows = sorted(res.items(), key=lambda kv: -kv[1]["spearman"])
        print(fmt_table(
            f"Forward-in-time split — term set {version.upper()} "
            f"(train {ntr} oldest, test {nte} newest)", rows, cols))

    print("\nPermutation importance (drop in Spearman), Ridge lam=20, v1")
    imp1 = permutation_importance(df, "v1", lambda: Ridge(20.0))
    imp2 = permutation_importance(df, "v2", lambda: Ridge(20.0))
    order = np.argsort(-imp1)
    print(f"  {'FEATURE':<24}{'v1':>10}{'v2':>10}")
    print("  " + "-" * 42)
    for j in order:
        print(f"  {FEATURES[j]:<24}{imp1[j]:>10.4f}{imp2[j]:>10.4f}")

    print("\nGreedy forward selection (Ridge lam=5, CV Spearman), v1")
    for i, (name, s) in enumerate(greedy_forward(df, "v1"), 1):
        print(f"  {i:>2}. +{name:<24} {s:.3f}")

    print("\nGreedy forward selection (Ridge lam=5, CV Spearman), v2")
    for i, (name, s) in enumerate(greedy_forward(df, "v2"), 1):
        print(f"  {i:>2}. +{name:<24} {s:.3f}")


if __name__ == "__main__":
    main()
