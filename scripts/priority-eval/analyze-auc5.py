"""
AUC for "brief-worthy" = human rating >= 5 (what The Stewardship Brief surfaces).

Re-uses estimators from analyze.py. Writes scripts/priority-eval/data/report-auc5.txt

    python scripts/priority-eval/analyze-auc5.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze import (
    CSV,
    TOPK,
    ElasticNet,
    GBT,
    LogisticL2,
    OrdinalLogistic,
    Ridge,
    Spec,
    auc_binary,
    fit_predict,
    kfold_indices,
    spearman,
    topk_mean,
)

# Brief threshold — same as BRIEF_MIN_PRIORITY in production.
BRIEF = 5
FOLDS = 5
REPEATS = 5
OUT = Path("scripts/priority-eval/data/report-auc5.txt")

SHIPPED_8 = [
    "stewardshipTitle",
    "clinicalBonusNorm",
    "isQ1",
    "isRct",
    "isSystematicReview",
    "largeStudy",
    "jifNorm",
    "keywordCountNorm",
]


def feature_names(df, version="v2"):
    prefix = f"{version}__"
    skip = {"relevance_pct", "penalty_factor", "fallback_priority"}
    names = [
        c[len(prefix) :]
        for c in df.columns
        if c.startswith(prefix)
        and "__flag__" not in c
        and c[len(prefix) :] not in skip
    ]
    return names if names else list(SHIPPED_8)


def specs_for_brief():
    return [
        Spec("Constant (train mean)", "constant"),
        Spec("Heuristic relevance %", "fixed", column="relevance_pct"),
        Spec("fallbackPredictedPriority", "fixed", column="fallback_priority"),
        Spec("Ridge lam=1.5 (old prod)", "trained", build=lambda: Ridge(1.5)),
        Spec("Ridge lam=20", "trained", build=lambda: Ridge(20.0)),
        Spec("Ridge lam=60", "trained", build=lambda: Ridge(60.0)),
        Spec("ElasticNet a=0.05", "trained", build=lambda: ElasticNet(0.05, 0.5)),
        Spec("Lasso a=0.05", "trained", build=lambda: ElasticNet(0.05, 1.0)),
        Spec("Ordinal logistic", "trained", build=lambda: OrdinalLogistic(2.0)),
        Spec("Logistic P(>=5)", "trained", build=lambda: LogisticL2(5.0)),
        Spec("GBT depth3 x200", "trained", build=lambda: GBT(200, 0.05, 3, 20, seed=1)),
        Spec("GBT depth2 x300", "trained", build=lambda: GBT(300, 0.05, 2, 25, seed=2)),
    ]


def fit_predict_brief(spec, Xtr, ytr, Xte, cols_te):
    """Like fit_predict, but binary logistic trains on rating >= 5."""
    if spec.kind == "trained" and "Logistic" in spec.name:
        m = spec.build().fit(Xtr, (ytr >= BRIEF).astype(float))
        return m.decision(Xte), None
    return fit_predict(spec, Xtr, ytr, Xte, cols_te)


def run_cv(df, version, feature_names, specs, folds=FOLDS, repeats=REPEATS):
    X = df[[f"{version}__{f}" for f in feature_names]].to_numpy(float)
    y = df["rating"].to_numpy(float)
    cols = {
        "relevance_pct": df[f"{version}__relevance_pct"].to_numpy(float),
        "fallback_priority": df[f"{version}__fallback_priority"].to_numpy(float),
    }
    n = len(y)
    bag = {s.name: {"auc5": [], "spearman": [], "top10_mean": []} for s in specs}

    for rep in range(repeats):
        rng = np.random.default_rng(5100 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            cols_te = {k: v[te] for k, v in cols.items()}
            yb = (y[te] >= BRIEF).astype(int)
            for s in specs:
                score, _ = fit_predict_brief(s, X[tr], y[tr], X[te], cols_te)
                bag[s.name]["auc5"].append(auc_binary(yb, score))
                bag[s.name]["spearman"].append(spearman(score, y[te]))
                bag[s.name]["top10_mean"].append(topk_mean(y[te], score, TOPK, rng))

    out = {}
    for name, m in bag.items():
        out[name] = {
            "auc5": float(np.nanmean(m["auc5"])),
            "auc5_se": float(np.nanstd(m["auc5"]) / np.sqrt(max(1, np.sum(~np.isnan(m["auc5"]))))),
            "spearman": float(np.nanmean(m["spearman"])),
            "top10_mean": float(np.nanmean(m["top10_mean"])),
        }
    return out


def print_table(title, results, lines):
    lines.append(title)
    lines.append("-" * 88)
    lines.append(
        f"  {'MODEL':<36}{'AUC>=5':>10}{'SE':>8}{'spearman':>11}{'top10 mean':>12}"
    )
    lines.append("-" * 88)
    ranked = sorted(results.items(), key=lambda kv: -kv[1]["auc5"])
    for name, r in ranked:
        lines.append(
            f"  {name:<36}{r['auc5']:>10.3f}{r['auc5_se']:>8.3f}"
            f"{r['spearman']:>11.3f}{r['top10_mean']:>12.3f}"
        )
    lines.append("")


def plain_language(y, results_v2_shipped, lines):
    n = len(y)
    n_pos = int((y >= BRIEF).sum())
    pct = 100.0 * n_pos / n
    auc = results_v2_shipped["Ridge lam=20"]["auc5"]
    # Rough "how often right if you pick one brief-worthy and one not"
    # AUC is P(score_pos > score_neg). Convert to a friendly % and lift vs coin flip.
    lift = (auc - 0.5) / 0.5  # 0 = coin flip, 1 = perfect

    lines.append("PLAIN-LANGUAGE SUMMARY (for non-ML readers)")
    lines.append("=" * 72)
    lines.append("")
    lines.append(
        f"The Stewardship Brief only surfaces studies you (or the model) rate"
    )
    lines.append(
        f"5 or higher on a 1–10 scale. In the {n} rated articles we have,"
    )
    lines.append(
        f"{n_pos} ({pct:.0f}%) actually cleared that bar — so about 1 in "
        f"{round(n / max(n_pos, 1))}."
    )
    lines.append("")
    lines.append(
        "AUC (area under the ROC curve) answers one question:"
    )
    lines.append(
        "  If we pick one brief-worthy paper and one that is not, how often"
    )
    lines.append(
        "  does the model give the worthy one the higher score?"
    )
    lines.append("")
    lines.append("  0.50 = coin flip (no skill)")
    lines.append("  0.70 = useful")
    lines.append("  0.80 = strong")
    lines.append("  1.00 = perfect")
    lines.append("")
    lines.append(
        f"Shipped model (v2 vocabulary, 8 features, Ridge): AUC = {auc:.3f}"
    )
    lines.append(
        f"  → about {auc * 100:.0f}% of those head-to-head matchups are correct"
    )
    lines.append(
        f"  → {lift * 100:.0f}% of the way from coin flip toward perfect"
    )
    lines.append("")
    lines.append(
        "That is the number that matters for the Brief: can we tell"
    )
    lines.append(
        "“show this” from “skip this,” not just rank everything finely."
    )
    lines.append("")
    lines.append(
        "Note: earlier reports used AUC for rating ≥7 (a much rarer bar,"
    )
    lines.append(
        "only ~3.5% of ratings). ≥5 is easier and matches production."
    )
    lines.append("")


def main():
    df = pd.read_csv(CSV)
    y = df["rating"].to_numpy(float)
    specs = specs_for_brief()
    names = feature_names(df, "v2")
    tables: list[str] = []

    shipped: dict[str, dict] = {}
    for version in ("v1", "v2"):
        # Prefer columns present for this version; fall back to v2 names.
        feats = feature_names(df, version)
        shipped[version] = run_cv(df, version, feats, specs)
        print_table(
            f"5-fold CV ×{REPEATS} — term set {version.upper()} "
            f"({len(feats)} features: {', '.join(feats)})",
            shipped[version],
            tables,
        )

    final: list[str] = []
    final.append("=" * 72)
    final.append("BRIEF THRESHOLD EVALUATION — human rating ≥ 5")
    final.append("=" * 72)
    final.append("")
    final.append(f"n = {len(df)} rated articles")
    final.append(
        f"≥5: {(y >= BRIEF).sum()} ({(y >= BRIEF).mean():.1%})  |  "
        f"mean rating {y.mean():.2f}"
    )
    final.append(f"Method: {FOLDS}-fold CV × {REPEATS} repeats")
    final.append(f"Features: {', '.join(names)}")
    final.append("")
    plain_language(y, shipped["v2"], final)
    final.extend(tables)

    text = "\n".join(final) + "\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
