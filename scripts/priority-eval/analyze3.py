"""
Decide the final configuration:
  - which term set wins (v1 / v2 / v2n with narrowed Multicenter)
  - which 8 features to keep under that term set
  - a replacement calibration for fallbackPredictedPriority
"""

import numpy as np
import pandas as pd

from analyze import (
    CSV, FEATURES, HIGH, TOPK, Ridge, ElasticNet, OrdinalLogistic,
    kfold_indices, spearman, auc_binary, topk_mean, precision_at_k,
)

VERSIONS = ["v1", "v2", "v2n"]


def cols(df, version, names=FEATURES):
    return df[[f"{version}__{n}" for n in names]].to_numpy(float)


def ladder(df, version, folds=5, repeats=6):
    X, y = cols(df, version), df["rating"].to_numpy(float)
    n = len(y)
    models = {
        "Ridge lam=20": lambda: Ridge(20.0),
        "Lasso a=0.05": lambda: ElasticNet(0.05, 1.0),
        "Ordinal logistic": lambda: OrdinalLogistic(2.0),
    }
    out = {}
    for label, build in models.items():
        sp, au, tk = [], [], []
        for rep in range(repeats):
            rng = np.random.default_rng(2000 + rep)
            for te in kfold_indices(n, folds, rng):
                tr = np.setdiff1d(np.arange(n), te)
                m = build().fit(X[tr], y[tr])
                pr = m.decision(X[te]) if hasattr(m, "decision") else m.predict(X[te])
                sp.append(spearman(pr, y[te]))
                au.append(auc_binary((y[te] >= HIGH).astype(int), pr))
                tk.append(topk_mean(y[te], pr, TOPK, rng))
        out[label] = (float(np.mean(sp)), float(np.std(sp) / np.sqrt(len(sp))),
                      float(np.nanmean(au)), float(np.mean(tk)))
    return out


def paired(df, va, vb, folds=5, repeats=10):
    """Delta = vb - va on identical folds."""
    Xa, Xb = cols(df, va), cols(df, vb)
    y = df["rating"].to_numpy(float)
    n = len(y)
    ds, da = [], []
    for rep in range(repeats):
        rng = np.random.default_rng(4400 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            pa = Ridge(20.0).fit(Xa[tr], y[tr]).predict(Xa[te])
            pb = Ridge(20.0).fit(Xb[tr], y[tr]).predict(Xb[te])
            yb = (y[te] >= HIGH).astype(int)
            ds.append(spearman(pb, y[te]) - spearman(pa, y[te]))
            da.append(auc_binary(yb, pb) - auc_binary(yb, pa))
    ds = np.array(ds)
    da = np.array([x for x in da if not np.isnan(x)])
    return (ds.mean(), ds.std() / np.sqrt(len(ds)), (ds > 0).mean(),
            da.mean(), da.std() / np.sqrt(len(da)))


def greedy(df, version, max_feats=12, folds=5, repeats=4):
    X, y = cols(df, version), df["rating"].to_numpy(float)
    n = len(y)
    fold_sets = []
    for rep in range(repeats):
        rng = np.random.default_rng(310 + rep)
        fold_sets.extend(kfold_indices(n, folds, rng))

    def sc(idx):
        v = []
        for te in fold_sets:
            tr = np.setdiff1d(np.arange(n), te)
            m = Ridge(5.0).fit(X[np.ix_(tr, idx)], y[tr])
            v.append(spearman(m.predict(X[np.ix_(te, idx)]), y[te]))
        return float(np.mean(v))

    chosen, remaining, hist = [], list(range(len(FEATURES))), []
    while remaining and len(chosen) < max_feats:
        best = max(remaining, key=lambda j: sc(chosen + [j]))
        hist.append((FEATURES[best], sc(chosen + [best])))
        chosen.append(best)
        remaining.remove(best)
    return hist


def subset_eval(df, version, names, folds=5, repeats=10):
    X, y = cols(df, version, names), df["rating"].to_numpy(float)
    n = len(y)
    sp, tk, pk = [], [], []
    for rep in range(repeats):
        rng = np.random.default_rng(7700 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            m = Ridge(20.0).fit(X[tr], y[tr])
            pr = m.predict(X[te])
            sp.append(spearman(pr, y[te]))
            tk.append(topk_mean(y[te], pr, TOPK, rng))
            pk.append(precision_at_k(y[te], pr, TOPK, rng))
    return (float(np.mean(sp)), float(np.std(sp) / np.sqrt(len(sp))),
            float(np.mean(tk)), float(np.mean(pk)))


def fit_fallback(df, version, names):
    """Ridge fit on the full corpus, reported as plain-English coefficients so
    the fallback formula can be replaced with calibrated numbers."""
    X, y = cols(df, version, names), df["rating"].to_numpy(float)
    m = Ridge(20.0).fit(X, y)
    return m.mu, m.sd, m.coef[:-1], m.coef[-1]


def main():
    df = pd.read_csv(CSV)
    y = df["rating"].to_numpy(float)
    print("=" * 76)
    print("FINAL CONFIGURATION DECISIONS")
    print("=" * 76)

    print("\n1. MULTICENTER FLAG ACROSS TERM SETS (corpus mean rating "
          f"{y.mean():.2f})")
    print(f"    {'SET':<6}{'fires':>9}{'mean rating':>14}{'spearman':>11}")
    for v in VERSIONS:
        f = df[f"{v}__flag__Multicenter"].to_numpy(bool)
        feat = df[f"{v}__isMulticenter"].to_numpy(float)
        print(f"    {v:<6}{f.mean():>8.1%}{y[f].mean():>14.2f}"
              f"{spearman(feat, y):>11.3f}")

    print("\n2. MODEL LADDER BY TERM SET (5-fold x6, Spearman +- SE)")
    print(f"    {'MODEL':<20}" + "".join(f"{v:>18}" for v in VERSIONS))
    tables = {v: ladder(df, v) for v in VERSIONS}
    for label in tables["v1"]:
        cells = ""
        for v in VERSIONS:
            mu, se, _, _ = tables[v][label]
            cells += f"{mu:>12.3f}+-{se:.3f}"
        print(f"    {label:<20}{cells}")
    print(f"\n    {'MODEL':<20}" + "".join(f"{v + ' top10':>18}" for v in VERSIONS))
    for label in tables["v1"]:
        cells = "".join(f"{tables[v][label][3]:>18.2f}" for v in VERSIONS)
        print(f"    {label:<20}{cells}")

    print("\n3. PAIRED COMPARISONS (Ridge lam=20, 50 identical folds)")
    print(f"    {'COMPARISON':<16}{'d spearman':>13}{'SE':>8}{'wins':>8}"
          f"{'d AUC':>10}{'SE':>8}")
    for va, vb in [("v1", "v2"), ("v1", "v2n"), ("v2", "v2n")]:
        ds, dse, win, da, dase = paired(df, va, vb)
        print(f"    {vb + ' - ' + va:<16}{ds:>+13.4f}{dse:>8.4f}{win:>7.0%}"
              f"{da:>+10.4f}{dase:>8.4f}")

    best = max(VERSIONS, key=lambda v: tables[v]["Ridge lam=20"][0])
    print(f"\n    -> best term set by CV Spearman: {best}")

    print(f"\n4. GREEDY FORWARD SELECTION UNDER {best}")
    hist = greedy(df, best)
    for i, (name, s) in enumerate(hist, 1):
        print(f"    {i:>2}. +{name:<22} {s:.3f}")

    print("\n5. FEATURE SUBSET COMPARISON UNDER " + best)
    order = [n for n, _ in hist]
    candidates = {
        "all 19": FEATURES,
        "greedy top 6": order[:6],
        "greedy top 8": order[:8],
        "greedy top 10": order[:10],
    }
    print(f"    {'SUBSET':<16}{'k':>4}{'spearman':>11}{'SE':>8}"
          f"{'top10 mean':>12}{'p@10':>8}")
    for label, names in candidates.items():
        sp, se, tk, pk = subset_eval(df, best, names)
        print(f"    {label:<16}{len(names):>4}{sp:>11.3f}{se:>8.3f}"
              f"{tk:>12.2f}{pk:>8.3f}")

    keep = order[:8]
    print(f"\n    -> keeping 8: {keep}")

    print("\n6. CALIBRATED FALLBACK COEFFICIENTS "
          f"(Ridge lam=20 on all {len(df)} rows, term set {best})")
    mu, sd, w, b = fit_fallback(df, best, keep)
    print(f"    intercept {b:.4f}")
    print(f"    {'FEATURE':<22}{'mean':>10}{'sd':>10}{'weight':>10}")
    for i, name in enumerate(keep):
        print(f"    {name:<22}{mu[i]:>10.4f}{sd[i]:>10.4f}{w[i]:>10.4f}")
    pred = np.clip(np.round(Ridge(20.0).fit(cols(df, best, keep), y).predict(
        cols(df, best, keep))), 1, 10)
    print(f"    in-sample predicted mean {pred.mean():.2f} vs actual {y.mean():.2f}"
          f"  |  MAE {np.abs(pred - y).mean():.2f}")


if __name__ == "__main__":
    main()
