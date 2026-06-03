# Study classification: full abstract and “Unclear” fixes

Classification uses the **full abstract** from the PubMed fetch (not the 3-sentence summary). The ingest flow passes `record.abstract` from `fetchPubMedRecords()` into `classifyStudyAbstract()`.

If you still see “Unclear” on the feed, use the steps below to confirm whether the problem is missing/short abstracts, existing rows, or the model.

---

## 1. Re-run ingest and check the response

Ingest now returns **`top5Details`** for the top 5 articles. Each item has:

- **`pmid`** – Article ID  
- **`abstractLength`** – Character count of the abstract (0 if none)  
- **`hasAbstract`** – Whether a non-empty abstract was present  
- **`subheading`** / **`label`** – What was stored (or `"(existing)"` / `"Unclear"` and **`skipped`** when no new row was written)

**Run ingest:**

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"topicId":"YOUR_TOPIC_ID"}'
```

In the JSON response, look at **`top5Details`**:

- **`abstractLength`** 0 or very small → PubMed didn’t give an abstract (or we didn’t parse it). Classification correctly returns Unclear when there’s no abstract.
- **`abstractLength`** large (e.g. 500+) and **`subheading`** / **`label`** are real values → Classification is working; feed should show them after refresh.
- **`skipped: "summary already exists"`** → That row was not updated. Existing summaries keep their old classification (including “Unclear”) until you either clear them or add a separate “re-classify” flow.

So: **re-run ingest** and use **`top5Details`** to confirm that the full abstract is present and what classification was stored.

---

## 2. Ensure new summaries get the full abstract

- Ingest does **not** use the DB abstract. It uses the in-memory **`record`** from **`fetchPubMedRecords(pmids)`**.
- **`record.abstract`** is built in **`lib/pubmed/efetch.ts`** by joining all `<AbstractText>` segments from the PubMed XML with `\n\n`, so the full abstract is passed into **`classifyStudyAbstract({ abstract: record.abstract, ... })`**.

No code change is required for “full abstract” in ingest; the issue is usually missing data in PubMed or existing DB rows.

---

## 3. If summaries already exist and show “Unclear”

We only **insert** a new summary when one doesn’t exist for that `(topic_id, pmid)`. We never **update** an existing summary’s `subheading`/`label`.

So if the feed shows “Unclear” for old rows:

**Option A – Re-run ingest after clearing summaries (or use a new topic)**  
- Delete or clear the summary rows for that topic (or use a new topicId), then run ingest again. New rows will get classification from the full abstract.

**Option B – Add a “re-classify” job (future)**  
- A separate script or endpoint could: read existing summaries (and their articles’ full abstract from the DB), call `classifyStudyAbstract`, and **update** `subheading`/`label` on the summaries table. That’s not implemented yet.

For now, **Option A** is the way to refresh: clear existing summaries for the topic (or use a new topic) and run ingest again.

---

## 4. Verify with the debug endpoint

To confirm the model returns a real type (e.g. RCT) when given a clear abstract:

**4a. With a made-up abstract**

```text
GET http://localhost:3000/api/debug-classify?abstract=We%20conducted%20a%20randomized%20controlled%20trial%20of%20200%20patients%20comparing%20metformin%20versus%20placebo.
```

If the response has **`parsed.study_subheading`** / **`parsed.study_label`** like RCT, the pipeline is fine; the issue is abstract quality/length or existing DB rows.

**4b. With a real abstract from your data**

1. Run ingest and pick a **`pmid`** from **`top5Details`** that has **`abstractLength`** > 0.
2. Get that article’s abstract, e.g. from the feed (if you display it) or from **`/api/pubmed/test-fetch?ids=PMID`** (use that PMID).
3. Call the debug endpoint with that full abstract (URL-encoded):

   ```text
   GET http://localhost:3000/api/debug-classify?abstract=<URL_ENCODED_ABSTRACT>&title=<URL_ENCODED_TITLE>
   ```

If this returns a real subheading/label, then the classifier works for that abstract; the remaining problem is either that this article’s summary wasn’t re-created (e.g. “summary already exists”) or the feed is reading old data.

---

## 5. Quick checklist

| Step | Action |
|------|--------|
| 1 | Run **POST /api/ingest** with your `topicId`. |
| 2 | In the response, check **`top5Details`**: `abstractLength` and `subheading`/`label` (or `skipped`). |
| 3 | If abstracts are long and classifications look correct but the feed still shows “Unclear”, **refresh the feed** (or hard refresh). |
| 4 | If rows were **skipped** (“summary already exists”), clear those summary rows for the topic and **re-run ingest**, or use a new topic. |
| 5 | Use **GET /api/debug-classify?abstract=...** with a real or clear abstract to confirm the model returns the expected type. |

---

## Summary

- **Full abstract is used in ingest:** `record.abstract` from PubMed fetch is passed to `classifyStudyAbstract`; the 3-sentence summary is only for display.
- Use **`top5Details`** in the ingest response to see abstract lengths and stored classifications.
- To get rid of “Unclear” for already-created summaries, re-run ingest after clearing existing summary rows for that topic (or use a new topic) so new rows are created with the current classifier and full abstract.
