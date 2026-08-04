"""
Verify the shipped configuration: v2 vocabulary, the reduced 8-feature vector,
and the recalibrated fallback. Reads whatever feature columns the export
produced rather than a hardcoded list, so it stays valid as the vector changes.
"""

import numpy as np
import pandas as pd

from analyze import (
    CSV, HIGH, TOPK, Ridge, kfold_indices, spearman, auc_binary,
    topk_mean, precision_at_k,
)

# Baselines from the pre-change configuration, for reference.
OLD_V1_19_FEATURE_SPEARMAN = 0.538


def feature_names(df):
    prefix = "v2__"
    skip = {"relevance_pct", "penalty_factor", "fallback_priority"}
    return [
        c[len(prefix):] for c in df.columns
        if c.startswith(prefix) and "__flag__" not in c
        and c[len(prefix):] not in skip
    ]


def cv(df, version, names, folds=5, repeats=10):
    X = df[[f"{version}__{n}" for n in names]].to_numpy(float)
    y = df["rating"].to_numpy(float)
    n = len(y)
    sp, au, tk, pk = [], [], [], []
    for rep in range(repeats):
        rng = np.random.default_rng(8800 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            pr = Ridge(20.0).fit(X[tr], y[tr]).predict(X[te])
            sp.append(spearman(pr, y[te]))
            au.append(auc_binary((y[te] >= HIGH).astype(int), pr))
            tk.append(topk_mean(y[te], pr, TOPK, rng))
            pk.append(precision_at_k(y[te], pr, TOPK, rng))
    return (float(np.mean(sp)), float(np.std(sp) / np.sqrt(len(sp))),
            float(np.nanmean(au)), float(np.mean(tk)), float(np.mean(pk)))


def main():
    df = pd.read_csv(CSV)
    y = df["rating"].to_numpy(float)
    names = feature_names(df)

    print("=" * 72)
    print("SHIPPED CONFIGURATION VERIFICATION")
    print("=" * 72)
    print(f"\nFeature vector ({len(names)}): {', '.join(names)}")

    consts = [n for n in names if df[f"v2__{n}"].std() < 1e-9]
    print(f"Constant features: {consts if consts else 'none'}")

    print(f"\nRidge lam=20, 5-fold x10 (n={len(df)})")
    print(f"  {'TERM SET':<10}{'spearman':>11}{'SE':>8}{'AUC>=7':>10}"
          f"{'top10 mean':>12}{'p@10':>8}")
    for v in ("v1", "v2"):
        sp, se, au, tk, pk = cv(df, v, names)
        print(f"  {v:<10}{sp:>11.3f}{se:>8.3f}{au:>10.3f}{tk:>12.2f}{pk:>8.3f}")

    sp2 = cv(df, "v2", names)[0]
    print(f"\n  Previous configuration (v1 vocabulary, 19 features): "
          f"{OLD_V1_19_FEATURE_SPEARMAN:.3f}")
    print(f"  Shipped configuration (v2 vocabulary, {len(names)} features): {sp2:.3f}")
    print(f"  Net change: {sp2 - OLD_V1_19_FEATURE_SPEARMAN:+.3f}")

    print("\nRecalibrated fallbackPredictedPriority (in-sample, since its "
          "coefficients\nwere fit on this corpus — it only runs below 8 ratings)")
    for v in ("v1", "v2"):
        fb = df[f"{v}__fallback_priority"].to_numpy(float)
        print(f"  {v}: mean {fb.mean():.2f} vs actual {y.mean():.2f}"
              f"  |  MAE {np.abs(fb - y).mean():.2f}"
              f"  |  range {fb.min():.0f}-{fb.max():.0f}"
              f"  |  spearman {spearman(fb, y):.3f}")
    print("  Before this change: mean 7.24, MAE 3.67")


if __name__ == "__main__":
    main()
