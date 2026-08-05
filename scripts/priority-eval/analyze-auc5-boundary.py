"""
Compare AUC for Brief threshold (>=5) with the previous 8 features vs the
11-feature vector (adds isReview, isGuideline, isRetrospectiveOrSurvey).

Also prints 4-vs-5-only AUC and calibrated fallback coefficients.

    python scripts/priority-eval/analyze-auc5-boundary.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from analyze import (
    CSV,
    TOPK,
    ElasticNet,
    LogisticL2,
    OrdinalLogistic,
    Ridge,
    auc_binary,
    kfold_indices,
    spearman,
    topk_mean,
)

BRIEF = 5
FOLDS = 5
REPEATS = 8
OUT = Path("scripts/priority-eval/data/report-auc5-boundary.txt")

BASE8 = [
    "stewardshipTitle",
    "clinicalBonusNorm",
    "isQ1",
    "isRct",
    "isSystematicReview",
    "largeStudy",
    "jifNorm",
    "keywordCountNorm",
]
NEW3 = ["isReview", "isGuideline", "isRetrospectiveOrSurvey"]


def feature_names(df, version="v2"):
    prefix = f"{version}__"
    skip = {"relevance_pct", "penalty_factor", "fallback_priority"}
    return [
        c[len(prefix) :]
        for c in df.columns
        if c.startswith(prefix)
        and "__flag__" not in c
        and c[len(prefix) :] not in skip
    ]


def cv_auc(X, y, build, folds=FOLDS, repeats=REPEATS, binary_fit=False):
    n = len(y)
    aucs, sps, tks = [], [], []
    for rep in range(repeats):
        rng = np.random.default_rng(6200 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            ytr = (y[tr] >= BRIEF).astype(float) if binary_fit else y[tr]
            m = build().fit(X[tr], ytr)
            if hasattr(m, "decision") and binary_fit:
                score = m.decision(X[te])
            elif hasattr(m, "decision"):
                score = m.decision(X[te])
            else:
                score = m.predict(X[te])
            aucs.append(auc_binary((y[te] >= BRIEF).astype(int), score))
            sps.append(spearman(score, y[te]))
            tks.append(topk_mean(y[te], score, TOPK, rng))
    return (
        float(np.nanmean(aucs)),
        float(np.nanstd(aucs) / np.sqrt(max(1, np.sum(~np.isnan(aucs))))),
        float(np.nanmean(sps)),
        float(np.nanmean(tks)),
    )


def cv_auc_boundary45(X, y, build, folds=FOLDS, repeats=REPEATS):
    """AUC only on rows with rating 4 or 5."""
    mask = (y == 4) | (y == 5)
    idx = np.where(mask)[0]
    yb = (y[idx] >= BRIEF).astype(int)
    Xb = X[idx]
    n = len(idx)
    aucs = []
    for rep in range(repeats):
        rng = np.random.default_rng(6300 + rep)
        for te_local in kfold_indices(n, folds, rng):
            tr_local = np.setdiff1d(np.arange(n), te_local)
            m = build().fit(Xb[tr_local], y[idx][tr_local])
            score = m.predict(Xb[te_local])
            aucs.append(auc_binary(yb[te_local], score))
    return float(np.nanmean(aucs)), float(
        np.nanstd(aucs) / np.sqrt(max(1, np.sum(~np.isnan(aucs))))
    )


def fit_fallback(X, y, lam=20.0):
    """Standardize + ridge; return means, stds, weights, bias."""
    mu = X.mean(0)
    sd = X.std(0)
    sd[sd < 1e-8] = 1.0
    Z = (X - mu) / sd
    m = Ridge(lam).fit(Z, y)
    # Ridge in analyze.py standardizes again internally — use our Z and refit
    # with no further std by using already-z scores and reading coefs.
    # Simpler: closed form on Z with intercept.
    n, p = Z.shape
    A = np.zeros((p + 1, p + 1))
    b = np.zeros(p + 1)
    for i in range(n):
        row = np.append(Z[i], 1.0)
        A += np.outer(row, row)
        b += row * y[i]
    A[:p, :p] += lam * np.eye(p)
    coef = np.linalg.solve(A, b)
    return mu, sd, coef[:p], float(coef[p])


def main():
    df = pd.read_csv(CSV)
    y = df["rating"].to_numpy(float)
    names = feature_names(df, "v2")
    for req in BASE8 + NEW3:
        if req not in names:
            raise SystemExit(
                f"Missing feature {req} in CSV. Re-run export-dataset.ts first. "
                f"Have: {names}"
            )

    lines: list[str] = []
    w = lines.append
    w("=" * 72)
    w("BOUNDARY FEATURES — AUC for Brief threshold (>=5)")
    w("=" * 72)
    w("")
    w(f"n={len(df)}  >=5: {(y >= BRIEF).sum()} ({(y >= BRIEF).mean():.1%})")
    w(f"n(4)={(y == 4).sum()}  n(5)={(y == 5).sum()}")
    w(f"Method: {FOLDS}-fold x {REPEATS} repeats, term set v2")
    w("")

    sets = {
        "8 features (baseline)": BASE8,
        "11 features (+review/guideline/retro-survey)": BASE8 + NEW3,
    }

    models = [
        ("Ridge lam=20", lambda: Ridge(20.0), False),
        ("Ridge lam=1.5", lambda: Ridge(1.5), False),
        ("ElasticNet a=0.05", lambda: ElasticNet(0.05, 0.5), False),
        ("Ordinal logistic", lambda: OrdinalLogistic(2.0), False),
        ("Logistic P(>=5)", lambda: LogisticL2(5.0), True),
    ]

    results = {}
    for set_name, feats in sets.items():
        X = df[[f"v2__{f}" for f in feats]].to_numpy(float)
        w(set_name)
        w("-" * 72)
        w(
            f"  {'MODEL':<28}{'AUC>=5':>10}{'SE':>8}{'spearman':>11}"
            f"{'top10':>10}{'AUC 4vs5':>12}"
        )
        for label, build, binary in models:
            auc, se, sp, tk = cv_auc(X, y, build, binary_fit=binary)
            a45, se45 = cv_auc_boundary45(X, y, lambda: Ridge(20.0))
            w(
                f"  {label:<28}{auc:>10.3f}{se:>8.3f}{sp:>11.3f}"
                f"{tk:>10.3f}{a45:>12.3f}"
            )
            results[(set_name, label)] = (auc, a45)
        w("")

    # Prevalence of new flags
    w("New feature prevalence (v2)")
    w("-" * 72)
    for f in NEW3:
        col = df[f"v2__{f}"].to_numpy(float)
        w(
            f"  {f:<28} rate={col.mean():.1%}  "
            f"mean rating on={y[col > 0].mean():.2f}  "
            f"off={y[col == 0].mean():.2f}"
        )
    w("")

    base_auc = results[("8 features (baseline)", "Ridge lam=20")][0]
    new_auc = results[
        ("11 features (+review/guideline/retro-survey)", "Ridge lam=20")
    ][0]
    base_45 = results[("8 features (baseline)", "Ridge lam=20")][1]
    new_45 = results[
        ("11 features (+review/guideline/retro-survey)", "Ridge lam=20")
    ][1]
    w("PLAIN SUMMARY")
    w("-" * 72)
    w(f"  Ridge AUC>=5:  {base_auc:.3f} -> {new_auc:.3f}  ({new_auc - base_auc:+.3f})")
    w(f"  Ridge AUC 4vs5:{base_45:.3f} -> {new_45:.3f}  ({new_45 - base_45:+.3f})")
    w("")

    # Fallback calibration on full 11-feature matrix
    X11 = df[[f"v2__{f}" for f in BASE8 + NEW3]].to_numpy(float)
    mu, sd, wt, bias = fit_fallback(X11, y, lam=20.0)
    w("FALLBACK COEFFICIENTS (Ridge lam=20 on all rows, 11 features)")
    w("-" * 72)
    w(f"  intercept {bias:.4f}")
    for name, m, s, c in zip(BASE8 + NEW3, mu, sd, wt):
        w(f"  {name:<28} mean={m:8.4f}  sd={s:8.4f}  weight={c:+.4f}")
    pred = ((X11 - mu) / sd) @ wt + bias
    w(
        f"  in-sample mean {pred.mean():.2f} vs {y.mean():.2f} | "
        f"MAE {np.abs(pred - y).mean():.2f} | spearman {spearman(pred, y):.3f}"
    )
    w("")
    w("Paste-ready FALLBACK_TERMS:")
    w(f"const FALLBACK_INTERCEPT = {bias:.4f};")
    w("const FALLBACK_TERMS = [")
    for name, m, s, c in zip(BASE8 + NEW3, mu, sd, wt):
        w(
            f"  {{ mean: {m:.4f}, std: {max(s, 1e-8):.4f}, weight: {c:.4f} }}, // {name}"
        )
    w("];")

    text = "\n".join(lines) + "\n"
    OUT.write_text(text, encoding="utf-8")
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
