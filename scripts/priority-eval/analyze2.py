"""
Follow-ups to analyze.py:
  1. Learning curve — does the 300-sample training cap cost us anything?
  2. Paired v1-vs-v2 test on identical folds, with a standard error.
  3. Reduced feature set vs the full 19.
  4. Calibration of fallbackPredictedPriority.
"""

import numpy as np
import pandas as pd

from analyze import (
    CSV, FEATURES, HIGH, TOPK, Ridge, ElasticNet, OrdinalLogistic, GBT,
    kfold_indices, spearman, auc_binary, precision_at_k, topk_mean, rankdata,
)

REDUCED = [
    "stewardshipTitle", "clinicalBonusNorm", "isQ1", "isRct", "largeStudy",
    "isSystematicReview", "jifNorm", "keywordCountNorm",
]


def cols(df, version, names=FEATURES):
    return df[[f"{version}__{n}" for n in names]].to_numpy(float)


def learning_curve(df, version, sizes, repeats=15, test_n=200):
    X, y = cols(df, version), df["rating"].to_numpy(float)
    n = len(y)
    out = {s: [] for s in sizes}
    for rep in range(repeats):
        rng = np.random.default_rng(9000 + rep)
        perm = rng.permutation(n)
        te, pool = perm[:test_n], perm[test_n:]
        for s in sizes:
            if s > len(pool):
                continue
            tr = pool[:s]
            m = Ridge(20.0).fit(X[tr], y[tr])
            out[s].append(spearman(m.predict(X[te]), y[te]))
    return {s: (float(np.mean(v)), float(np.std(v) / np.sqrt(len(v))))
            for s, v in out.items() if v}


def recency_learning_curve(df, version, sizes, repeats=1, test_n=200):
    """Mimics production: train on the N most recently rated before the test
    window, rather than a random sample."""
    d = df.sort_values("rated_at").reset_index(drop=True)
    X, y = cols(d, version), d["rating"].to_numpy(float)
    n = len(y)
    te = np.arange(n - test_n, n)
    pool = np.arange(0, n - test_n)
    out = {}
    for s in sizes:
        if s > len(pool):
            continue
        tr = pool[-s:]
        m = Ridge(20.0).fit(X[tr], y[tr])
        out[s] = spearman(m.predict(X[te]), y[te])
    return out


def paired_compare(df, folds=5, repeats=10):
    X1, X2 = cols(df, "v1"), cols(df, "v2")
    y = df["rating"].to_numpy(float)
    n = len(y)
    d_sp, d_auc, d_top = [], [], []
    for rep in range(repeats):
        rng = np.random.default_rng(4000 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            p1 = Ridge(20.0).fit(X1[tr], y[tr]).predict(X1[te])
            p2 = Ridge(20.0).fit(X2[tr], y[tr]).predict(X2[te])
            yb = (y[te] >= HIGH).astype(int)
            d_sp.append(spearman(p2, y[te]) - spearman(p1, y[te]))
            d_auc.append(auc_binary(yb, p2) - auc_binary(yb, p1))
            r = np.random.default_rng(1)
            d_top.append(topk_mean(y[te], p2, TOPK, r) - topk_mean(y[te], p1, TOPK, r))
    def stat(v):
        v = np.array([x for x in v if not np.isnan(x)])
        return v.mean(), v.std() / np.sqrt(len(v)), (v > 0).mean()
    return {"spearman": stat(d_sp), "auc7": stat(d_auc), "top10_mean": stat(d_top)}


def feature_set_compare(df, version, folds=5, repeats=10):
    y = df["rating"].to_numpy(float)
    n = len(y)
    sets = {
        "all 19": FEATURES,
        "reduced 8": REDUCED,
        "reduced 5": REDUCED[:5],
        "stewardshipTitle only": ["stewardshipTitle"],
        "clinicalBonusNorm only": ["clinicalBonusNorm"],
    }
    out = {}
    for label, names in sets.items():
        X = cols(df, version, names)
        vals, tops = [], []
        for rep in range(repeats):
            rng = np.random.default_rng(6000 + rep)
            for te in kfold_indices(n, folds, rng):
                tr = np.setdiff1d(np.arange(n), te)
                m = Ridge(20.0).fit(X[tr], y[tr])
                pr = m.predict(X[te])
                vals.append(spearman(pr, y[te]))
                tops.append(topk_mean(y[te], pr, TOPK, rng))
        out[label] = (float(np.mean(vals)), float(np.std(vals) / np.sqrt(len(vals))),
                      float(np.mean(tops)), len(names))
    return out


def main():
    df = pd.read_csv(CSV)
    y = df["rating"].to_numpy(float)
    print("=" * 78)
    print("FOLLOW-UP ANALYSIS")
    print("=" * 78)

    d = df.sort_values("rated_at").reset_index(drop=True)
    tail = d["rating"].to_numpy(float)[-218:]
    print(f"\nTime-split test window: {len(tail)} rows, "
          f"{(tail >= HIGH).sum()} rated >= {HIGH} "
          f"-> AUC there rests on very few positives; trust the CV numbers more.")

    print("\n1. LEARNING CURVE — random train subsets, fixed 200-row test set")
    sizes = [50, 100, 150, 200, 300, 400, 500, 600, 669]
    for version in ("v1", "v2"):
        lc = learning_curve(df, version, sizes)
        print(f"\n  term set {version.upper()}")
        print(f"    {'train n':>8}{'spearman':>11}{'se':>8}")
        for s, (mu, se) in lc.items():
            bar = "#" * int(60 * mu)
            print(f"    {s:>8}{mu:>11.3f}{se:>8.3f}  {bar}")

    print("\n2. LEARNING CURVE — most-recent-N training (what production does)")
    for version in ("v1", "v2"):
        rc = recency_learning_curve(df, version, sizes)
        print(f"\n  term set {version.upper()}  (test = 200 most recently rated)")
        print(f"    {'train n':>8}{'spearman':>11}")
        for s, v in rc.items():
            print(f"    {s:>8}{v:>11.3f}  {'#' * int(60 * v)}")

    print("\n3. PAIRED v2 - v1 ON IDENTICAL FOLDS (Ridge lam=20, 50 folds)")
    pc = paired_compare(df)
    print(f"    {'METRIC':<14}{'mean delta':>12}{'se':>9}{'folds v2 wins':>16}")
    for k, (mu, se, win) in pc.items():
        print(f"    {k:<14}{mu:>+12.4f}{se:>9.4f}{win:>15.0%}")

    print("\n4. FEATURE SET COMPARISON (Ridge lam=20)")
    for version in ("v1", "v2"):
        fs = feature_set_compare(df, version)
        print(f"\n  term set {version.upper()}")
        print(f"    {'FEATURE SET':<24}{'k':>4}{'spearman':>11}{'se':>8}{'top10_mean':>12}")
        for label, (mu, se, top, k) in fs.items():
            print(f"    {label:<24}{k:>4}{mu:>11.3f}{se:>8.3f}{top:>12.2f}")

    print("\n5. CALIBRATION OF fallbackPredictedPriority (used before 8 ratings exist)")
    for version in ("v1", "v2"):
        fb = df[f"{version}__fallback_priority"].to_numpy(float)
        print(f"    {version}: predicted mean {fb.mean():.2f} (range {fb.min():.0f}-{fb.max():.0f})"
              f"  vs actual mean {y.mean():.2f}  |  MAE {np.abs(fb - y).mean():.2f}")

    print("\n6. HEADROOM CHECK — perfect vs achieved top-10 on a 174-row fold")
    fold = 174
    exp_pos = fold * (y >= HIGH).mean()
    print(f"    A random {fold}-row fold holds ~{exp_pos:.1f} articles rated >= {HIGH},")
    print(f"    so a perfect ranker scores p@10 ~ {min(exp_pos, TOPK) / TOPK:.2f};")
    print(f"    random scores {(y >= HIGH).mean():.3f}. Models land near 0.13.")


if __name__ == "__main__":
    main()
