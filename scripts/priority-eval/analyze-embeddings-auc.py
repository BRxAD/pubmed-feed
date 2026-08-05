"""
Embedding AUC experiment for Brief threshold (>=5).

Very low effort: MiniLM via fastembed (onnx)
Low effort: OpenAI text-embedding-3-small

Compares:
  - baseline 11 handcrafted features
  - embedding cosine-to-positive-prototype alone
  - baseline + prototype similarity
  - baseline + 8 PCA dims of the embedding

    python scripts/priority-eval/analyze-embeddings-auc.py
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd

from analyze import Ridge, auc_binary, kfold_indices, spearman

BRIEF = 5
FOLDS = 5
REPEATS = 5
CSV = Path("scripts/priority-eval/data/priority-dataset.csv")
TEXTS = Path("scripts/priority-eval/data/priority-texts.jsonl")
CACHE = Path("scripts/priority-eval/data/embeddings-cache.npz")
OUT = Path("scripts/priority-eval/data/report-embeddings-auc.txt")
ENV_LOCAL = Path(".env.local")

BASE11 = [
    "stewardshipTitle",
    "clinicalBonusNorm",
    "isQ1",
    "isRct",
    "isSystematicReview",
    "largeStudy",
    "jifNorm",
    "keywordCountNorm",
    "isReview",
    "isGuideline",
    "isRetrospectiveOrSurvey",
]


def load_env_key(name: str) -> str:
    if os.environ.get(name):
        return os.environ[name].strip()
    if not ENV_LOCAL.exists():
        return ""
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == name:
            return v.strip().strip('"').strip("'")
    return ""


def l2_normalize(X: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(X, axis=1, keepdims=True)
    n[n < 1e-12] = 1.0
    return X / n


def pca_fit_transform(Xtr: np.ndarray, Xte: np.ndarray, k: int = 8):
    mu = Xtr.mean(0)
    Z = Xtr - mu
    # economy SVD
    _, _, vt = np.linalg.svd(Z, full_matrices=False)
    W = vt[:k].T
    return (Xtr - mu) @ W, (Xte - mu) @ W


def cosine_to_pos_prototype(Etr: np.ndarray, ytr: np.ndarray, Ete: np.ndarray):
    pos = Etr[ytr >= BRIEF]
    if len(pos) == 0:
        return np.zeros(len(Ete))
    proto = l2_normalize(pos.mean(0, keepdims=True))[0]
    Et = l2_normalize(Ete)
    return Et @ proto


def cv_scores(X: np.ndarray, y: np.ndarray, folds=FOLDS, repeats=REPEATS):
    n = len(y)
    aucs, sps = [], []
    for rep in range(repeats):
        rng = np.random.default_rng(7100 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            pr = Ridge(20.0).fit(X[tr], y[tr]).predict(X[te])
            aucs.append(auc_binary((y[te] >= BRIEF).astype(int), pr))
            sps.append(spearman(pr, y[te]))
    return float(np.nanmean(aucs)), float(
        np.nanstd(aucs) / np.sqrt(max(1, np.sum(~np.isnan(aucs))))
    ), float(np.nanmean(sps))


def cv_with_emb(
    Xbase: np.ndarray,
    Emb: np.ndarray,
    y: np.ndarray,
    mode: str,
    folds=FOLDS,
    repeats=REPEATS,
):
    """mode: proto | base+proto | base+pca8 | proto_only_score (no ridge on base)"""
    n = len(y)
    aucs, sps = [], []
    for rep in range(repeats):
        rng = np.random.default_rng(7200 + rep)
        for te in kfold_indices(n, folds, rng):
            tr = np.setdiff1d(np.arange(n), te)
            if mode == "proto":
                sim_te = cosine_to_pos_prototype(Emb[tr], y[tr], Emb[te])
                # score = similarity alone
                pr = sim_te
            elif mode == "base+proto":
                sim_tr = cosine_to_pos_prototype(Emb[tr], y[tr], Emb[tr])
                sim_te = cosine_to_pos_prototype(Emb[tr], y[tr], Emb[te])
                Xtr = np.column_stack([Xbase[tr], sim_tr])
                Xte = np.column_stack([Xbase[te], sim_te])
                pr = Ridge(20.0).fit(Xtr, y[tr]).predict(Xte)
            elif mode == "base+pca8":
                Ptr, Pte = pca_fit_transform(Emb[tr], Emb[te], 8)
                Xtr = np.column_stack([Xbase[tr], Ptr])
                Xte = np.column_stack([Xbase[te], Pte])
                pr = Ridge(20.0).fit(Xtr, y[tr]).predict(Xte)
            else:
                raise ValueError(mode)
            aucs.append(auc_binary((y[te] >= BRIEF).astype(int), pr))
            sps.append(spearman(pr, y[te]))
    return float(np.nanmean(aucs)), float(
        np.nanstd(aucs) / np.sqrt(max(1, np.sum(~np.isnan(aucs))))
    ), float(np.nanmean(sps))


def embed_tfidf_svd(texts: list[str], k: int = 64) -> np.ndarray:
    """Very-low offline stand-in: bag-of-words → TruncatedSVD (sklearn)."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.decomposition import TruncatedSVD

    print(f"Fitting TF-IDF + TruncatedSVD(k={k})…")
    vec = TfidfVectorizer(
        max_features=20000,
        ngram_range=(1, 2),
        min_df=2,
        stop_words="english",
        sublinear_tf=True,
    )
    X = vec.fit_transform(texts)
    k = min(k, X.shape[1] - 1, X.shape[0] - 1)
    svd = TruncatedSVD(n_components=k, random_state=0)
    return svd.fit_transform(X).astype(np.float32)


def embed_minilm(texts: list[str]) -> np.ndarray | None:
    try:
        from fastembed import TextEmbedding
    except ImportError:
        print("fastembed not installed — skipping MiniLM")
        return None
    print("Loading MiniLM (fastembed onnx)…")
    try:
        model = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
        vecs = list(model.embed(texts, batch_size=64))
        return np.asarray(vecs, dtype=np.float32)
    except Exception as err:
        print(f"MiniLM failed ({type(err).__name__}: {err}) — skipping")
        return None


def embed_openai(texts: list[str], model: str = "text-embedding-3-small") -> np.ndarray:
    from openai import OpenAI

    key = load_env_key("OPENAI_API_KEY")
    if not key:
        raise SystemExit("OPENAI_API_KEY not found in env / .env.local")
    client = OpenAI(api_key=key)
    out = np.zeros((len(texts), 1536), dtype=np.float32)
    batch = 64
    print(f"Embedding {len(texts)} texts with {model}…")
    for i in range(0, len(texts), batch):
        chunk = texts[i : i + batch]
        # OpenAI rejects empty strings
        chunk = [t if t.strip() else " " for t in chunk]
        resp = client.embeddings.create(model=model, input=chunk)
        for row in resp.data:
            out[i + row.index] = np.asarray(row.embedding, dtype=np.float32)
        print(f"  {min(i + batch, len(texts))}/{len(texts)}")
        time.sleep(0.05)
    return out


def load_or_build_embeddings(pmids: list[str], texts: list[str]):
    out: dict[str, np.ndarray] = {}
    if CACHE.exists():
        z = np.load(CACHE, allow_pickle=True)
        cached_pmids = list(z["pmids"])
        if cached_pmids == pmids:
            print(f"Loaded embedding cache {CACHE} keys={z.files}")
            for k in z.files:
                if k != "pmids":
                    out[k] = z[k]

    # Always ensure TF-IDF SVD (offline, very low effort)
    if "tfidf_svd" not in out:
        out["tfidf_svd"] = embed_tfidf_svd(texts, k=64)

    if "openai" not in out:
        out["openai"] = embed_openai(texts)

    if "minilm" not in out:
        m = embed_minilm(texts)
        if m is not None:
            out["minilm"] = m

    np.savez_compressed(CACHE, pmids=np.array(pmids), **out)
    print(f"Wrote {CACHE} keys={list(out)}")
    return out


def main():
    df = pd.read_csv(CSV)
    texts_by_pmid = {}
    with TEXTS.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            texts_by_pmid[str(row["pmid"])] = row["text"]

    df["pmid"] = df["pmid"].astype(str)
    df = df[df["pmid"].isin(texts_by_pmid)].reset_index(drop=True)
    y = df["rating"].to_numpy(float)
    pmids = df["pmid"].tolist()
    texts = [texts_by_pmid[p] for p in pmids]
    Xbase = df[[f"v2__{c}" for c in BASE11]].to_numpy(float)

    print(f"n={len(df)}  >=5={(y >= BRIEF).sum()} ({(y >= BRIEF).mean():.1%})")

    emb_map = load_or_build_embeddings(pmids, texts)
    for k in list(emb_map):
        emb_map[k] = l2_normalize(emb_map[k].astype(np.float64))

    lines: list[str] = []
    w = lines.append
    w("=" * 72)
    w("EMBEDDING AUC — Brief threshold (human rating >= 5)")
    w("=" * 72)
    w("")
    w(f"n={len(df)}  >=5={(y >= BRIEF).sum()} ({(y >= BRIEF).mean():.1%})")
    w(f"CV: {FOLDS}-fold x {REPEATS}  |  Ridge lam=20 on handcrafted features")
    w("Prototype / PCA fit inside each training fold (no leakage).")
    w("")
    w("Very low: TF-IDF+SVD-64 (offline). MiniLM if download succeeds.")
    w("Low: OpenAI text-embedding-3-small.")
    w("")

    base_auc, base_se, base_sp = cv_scores(Xbase, y)
    rows = [
        ("Baseline 11 features", base_auc, base_se, base_sp),
    ]

    named = []
    if "tfidf_svd" in emb_map:
        named.append(("TF-IDF+SVD-64 (very low / offline)", emb_map["tfidf_svd"]))
    if "minilm" in emb_map:
        named.append(("MiniLM-L6-v2 (very low)", emb_map["minilm"]))
    if "openai" in emb_map:
        named.append(("OpenAI text-embedding-3-small (low)", emb_map["openai"]))

    for name, Emb in named:
        for mode, label in (
            ("proto", f"{name} · cos→>=5 prototype alone"),
            ("base+proto", f"{name} · baseline + prototype sim"),
            ("base+pca8", f"{name} · baseline + PCA-8"),
        ):
            auc, se, sp = cv_with_emb(Xbase, Emb, y, mode)
            rows.append((label, auc, se, sp))

    rows_sorted = sorted(rows, key=lambda r: -r[1])
    w(f"{'SETUP':<52}{'AUC>=5':>10}{'SE':>8}{'spearman':>11}")
    w("-" * 72)
    for label, auc, se, sp in rows_sorted:
        mark = " << baseline" if label.startswith("Baseline") else ""
        delta = auc - base_auc
        d = f"  ({delta:+.3f})" if not label.startswith("Baseline") else ""
        w(f"{label:<52}{auc:>10.3f}{se:>8.3f}{sp:>11.3f}{d}{mark}")
    w("")
    w("PLAIN SUMMARY")
    w("-" * 72)
    best = rows_sorted[0]
    w(f"  Baseline AUC>=5: {base_auc:.3f}")
    w(f"  Best setup: {best[0]}")
    w(f"  Best AUC>=5: {best[1]:.3f} ({best[1] - base_auc:+.3f} vs baseline)")
    w("")
    w("  Prototype alone = how well embedding similarity to known Brief-worthy")
    w("  papers separates >=5 without any handcrafted features.")
    w("  base+proto / base+pca8 = add that signal to the current model.")

    text = "\n".join(lines) + "\n"
    OUT.write_text(text, encoding="utf-8")
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
