import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capDecision } from "./caps";
import { createServiceClient, EXTRACT_TIMEOUT_MS } from "./client";
import { DEFAULT_PER_DAY, DEFAULT_USER_PER_HOUR, normalizeServiceUrl, readVaConfig } from "./config";
import { MemoryImages, MemoryStore } from "./memoryStore";
import { asVaErrorCode, isRetryable, messageFor } from "./messages";
import {
  checkVisualAbstract,
  DRAWING_STALE_MS,
  MAX_ATTEMPTS,
  PMID_RE,
  RETRY_COOLDOWN_MS,
  requestVisualAbstract,
  WORKING_STALE_MS,
  type VaDeps,
} from "./pipeline";
import { VaError, type VaServiceClient } from "./types";

const PMID = "40123456";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-10-06T12:00:00.000Z");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(200).fill(1)]);
const ON = readVaConfig({ VISUAL_ABSTRACT_URL: "https://va.example.com", VISUAL_ABSTRACT_KEY: "k".repeat(30) });

class FakeService implements VaServiceClient {
  extracts: string[] = [];
  renders = 0;
  extractError: VaError | null = null;
  renderError: VaError | null = null;
  async extract(pmid: string) {
    this.extracts.push(pmid);
    if (this.extractError) throw this.extractError;
    return { content: { findings: [pmid] }, contentVersion: "1.0.0+v1", costUsd: 0.05 };
  }
  async render() {
    this.renders += 1;
    if (this.renderError) throw this.renderError;
    return { png: PNG, renderVersion: "r1" };
  }
}

function setup(overrides: Partial<VaDeps> = {}) {
  const store = new MemoryStore();
  store.articles.add(PMID);
  const images = new MemoryImages();
  const service = new FakeService();
  const clock = { now: T0 };
  const deps: VaDeps = { config: ON, store, images, client: service, now: () => clock.now, ...overrides };
  return { store, images, service, clock, deps };
}

/** Click, then let the background work finish, as the route does with after(). */
async function click(deps: VaDeps, pmid = PMID, userId = USER) {
  const started = await requestVisualAbstract(deps, { pmid, userId });
  await started.run?.();
  return started;
}

describe("a click makes the visual abstract, once, and a repeat click is free", () => {
  it("reads the abstract, saves the findings, draws, stores the picture and says where it is", async () => {
    const { deps, store, images, service } = setup();
    const first = await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    assert.deepEqual(first.response, { status: "working", step: "extract" });
    assert.ok(first.run, "slow work is handed back to run after the response");
    assert.equal(service.extracts.length, 0, "nothing slow happens before the response");
    await first.run!();
    const row = store.rows.get(PMID)!;
    assert.equal(row.status, "ready");
    assert.equal(row.content_version, "1.0.0+v1");
    assert.equal(row.render_version, "r1");
    assert.equal(row.cost_usd, 0.05);
    assert.equal(row.attempts, 1);
    assert.equal(row.requested_by, USER);
    assert.match(row.image_path ?? "", new RegExp(`^${PMID}/[0-9a-z]+\\.png$`));
    assert.deepEqual([...images.files.get(row.image_path!)!], [...PNG]);

    const again = await click(deps, PMID, OTHER);
    assert.equal(again.response.status, "ready");
    assert.equal(again.run, null);
    assert.equal(service.extracts.length, 1, "no second model call");
    assert.equal(service.renders, 1);
  });

  it("only a paper in the articles table, with a PubMed ID, is made", async () => {
    const { deps, service } = setup();
    for (const bad of ["", "abc", "0", "W123", "12345678901", "1;drop", " 1"]) {
      const result = await requestVisualAbstract(deps, { pmid: bad, userId: USER });
      assert.equal(result.response.status, "failed", bad);
      assert.equal(result.run, null);
      assert.equal((result.response as { retryable: boolean }).retryable, false);
    }
    const unknown = await requestVisualAbstract(deps, { pmid: "999", userId: USER });
    assert.deepEqual(unknown.response, { status: "failed", code: "NOT_FOUND", message: messageFor("NOT_FOUND"), retryable: false });
    assert.equal(service.extracts.length, 0);
    assert.equal(PMID_RE.test("40123456"), true);
  });

  it("three people clicking the same new paper start one job", async () => {
    const { deps, service } = setup();
    const [a, b, c] = await Promise.all([
      requestVisualAbstract(deps, { pmid: PMID, userId: USER }),
      requestVisualAbstract(deps, { pmid: PMID, userId: OTHER }),
      requestVisualAbstract(deps, { pmid: PMID, userId: "33333333-3333-4333-8333-333333333333" }),
    ]);
    assert.equal([a, b, c].filter((started) => started.run).length, 1, "exactly one runs");
    for (const started of [a, b, c]) assert.deepEqual(started.response, { status: "working", step: "extract" });
    await [a, b, c].find((started) => started.run)!.run!();
    assert.equal(service.extracts.length, 1);
    assert.equal((await checkVisualAbstract(deps, PMID)).status, "ready");
  });

  it("while it is being made, a click shows progress and starts nothing", async () => {
    const { deps, store, service } = setup();
    const started = await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    assert.ok(started.run);
    const waiting = await requestVisualAbstract(deps, { pmid: PMID, userId: OTHER });
    assert.deepEqual(waiting.response, { status: "working", step: "extract" });
    assert.equal(waiting.run, null);
    await started.run!();
    assert.equal(store.rows.get(PMID)!.status, "ready");
    assert.equal(service.extracts.length, 1);
  });

  it("the findings are read for one paper at a time, and a status check never reads them", async () => {
    const { deps, store } = setup();
    await click(deps);
    assert.deepEqual(store.contentReads, [PMID]);
    const row = await store.get(PMID);
    assert.equal("content" in (row as object), false);
    await checkVisualAbstract(deps, PMID);
    assert.deepEqual(store.contentReads, [PMID]);
  });
});

describe("it is off when switched off or not set up, and never starts work then", () => {
  it("the kill switch and a missing key both answer 'disabled' without touching the database", async () => {
    for (const env of [
      { VISUAL_ABSTRACT_ENABLED: "0", VISUAL_ABSTRACT_URL: "https://va.example.com", VISUAL_ABSTRACT_KEY: "k".repeat(30) },
      {},
      { VISUAL_ABSTRACT_URL: "https://va.example.com" },
      { VISUAL_ABSTRACT_URL: "https://va.example.com", VISUAL_ABSTRACT_KEY: "short" },
      { VISUAL_ABSTRACT_URL: "http://va.example.com", VISUAL_ABSTRACT_KEY: "k".repeat(30) },
    ]) {
      const { deps, store } = setup({ config: readVaConfig(env) });
      const result = await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
      assert.equal(result.response.status, "disabled", JSON.stringify(env));
      assert.equal(result.run, null);
      assert.equal(store.rows.size, 0);
    }
  });

  it("reads limits from the environment, with sane defaults and no negative or silly values", () => {
    assert.equal(ON.userPerHour, DEFAULT_USER_PER_HOUR);
    assert.equal(ON.perDay, DEFAULT_PER_DAY);
    const custom = readVaConfig({ VISUAL_ABSTRACT_URL: "https://va.example.com/", VISUAL_ABSTRACT_KEY: "k".repeat(30), VISUAL_ABSTRACT_USER_PER_HOUR: "2", VISUAL_ABSTRACT_PER_DAY: "10" });
    assert.deepEqual([custom.userPerHour, custom.perDay, custom.serviceUrl], [2, 10, "https://va.example.com"]);
    const odd = readVaConfig({ VISUAL_ABSTRACT_USER_PER_HOUR: "-3", VISUAL_ABSTRACT_PER_DAY: "lots" });
    assert.deepEqual([odd.userPerHour, odd.perDay], [DEFAULT_USER_PER_HOUR, DEFAULT_PER_DAY]);
    assert.equal(readVaConfig({ VISUAL_ABSTRACT_PER_DAY: "99999" }).perDay, 1000);
    assert.equal(normalizeServiceUrl("https://user:pw@va.example.com"), null);
    assert.equal(normalizeServiceUrl("https://va.example.com?x=1"), null);
    assert.equal(normalizeServiceUrl("ftp://va.example.com"), null);
    assert.equal(normalizeServiceUrl("http://localhost:3000/"), "http://localhost:3000");
  });
});

describe("limits keep the cost small", () => {
  it("the day limit is named before the hour limit, and a limit starts nothing", () => {
    const limits = { userPerHour: 5, perDay: 40 };
    assert.equal(capDecision({ userLastHour: 0, allLastDay: 0 }, limits), null);
    assert.equal(capDecision({ userLastHour: 4, allLastDay: 39 }, limits), null);
    assert.equal(capDecision({ userLastHour: 5, allLastDay: 3 }, limits), "LIMIT_USER");
    assert.equal(capDecision({ userLastHour: 1, allLastDay: 40 }, limits), "LIMIT_DAY");
    assert.equal(capDecision({ userLastHour: 9, allLastDay: 99 }, limits), "LIMIT_DAY");
  });

  it("one person can start five new papers an hour and no more; the sixth is told, not started", async () => {
    const { deps, store, service } = setup();
    for (let i = 0; i < 5; i += 1) {
      store.articles.add(String(100 + i));
      assert.equal((await click(deps, String(100 + i))).response.status, "working");
    }
    store.articles.add("200");
    const sixth = await requestVisualAbstract(deps, { pmid: "200", userId: USER });
    assert.deepEqual(sixth.response, { status: "failed", code: "LIMIT_USER", message: messageFor("LIMIT_USER"), retryable: false });
    assert.equal(sixth.run, null);
    assert.equal(store.rows.has("200"), false);
    assert.equal(service.extracts.length, 5);
    // Another person, and the same person an hour later, are not held back.
    assert.equal((await click(deps, "200", OTHER)).response.status, "working");
    store.articles.add("201");
    deps.now = () => T0 + 61 * 60_000;
    assert.equal((await click(deps, "201", USER)).response.status, "working");
  });

  it("the day limit stops everyone, and pictures already made are still shown", async () => {
    const { deps, store } = setup({ config: readVaConfig({ VISUAL_ABSTRACT_URL: "https://va.example.com", VISUAL_ABSTRACT_KEY: "k".repeat(30), VISUAL_ABSTRACT_PER_DAY: "2", VISUAL_ABSTRACT_USER_PER_HOUR: "9" }) });
    await click(deps);
    store.articles.add("101");
    await click(deps, "101", OTHER);
    store.articles.add("102");
    const third = await requestVisualAbstract(deps, { pmid: "102", userId: "33333333-3333-4333-8333-333333333333" });
    assert.equal((third.response as { code: string }).code, "LIMIT_DAY");
    assert.equal((await requestVisualAbstract(deps, { pmid: PMID, userId: OTHER })).response.status, "ready");
  });
});

describe("a failure is explained in plain words, and retried only when a retry can help", () => {
  it("a busy model shows a retryable message and the next click, after a moment, tries again", async () => {
    const { deps, store, service, clock } = setup();
    service.extractError = new VaError("MODEL_BUSY", "OpenAI 429");
    await click(deps);
    const row = store.rows.get(PMID)!;
    assert.equal(row.status, "failed");
    assert.equal(row.error_code, "MODEL_BUSY");
    const shown = await checkVisualAbstract(deps, PMID);
    assert.deepEqual(shown, { status: "failed", code: "MODEL_BUSY", message: messageFor("MODEL_BUSY"), retryable: true });
    assert.doesNotMatch(JSON.stringify(shown), /OpenAI|429/, "service words stay in the log");

    const tooSoon = await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    assert.equal(tooSoon.response.status, "failed", "a click right after a failure shows it again");
    assert.equal(tooSoon.run, null);
    assert.equal(service.extracts.length, 1);

    clock.now += RETRY_COOLDOWN_MS + 1;
    service.extractError = null;
    const retry = await click(deps);
    assert.equal(retry.response.status, "working");
    assert.equal(store.rows.get(PMID)!.status, "ready");
    assert.equal(store.rows.get(PMID)!.attempts, 2);
    assert.equal(store.rows.get(PMID)!.error_code, null);
  });

  it("a paper the maker cannot draw is not tried again", async () => {
    const { deps, service, clock } = setup();
    service.extractError = new VaError("NO_FINDINGS", "none");
    await click(deps);
    clock.now += 10 * 60_000;
    const again = await requestVisualAbstract(deps, { pmid: PMID, userId: OTHER });
    assert.deepEqual(again.response, { status: "failed", code: "NO_FINDINGS", message: messageFor("NO_FINDINGS"), retryable: false });
    assert.equal(again.run, null);
    assert.equal(service.extracts.length, 1, "no second model call for a deterministic refusal");
  });

  it("a paper that keeps failing stops being retried after its attempts", async () => {
    const { deps, store, service, clock } = setup();
    service.extractError = new VaError("MODEL_TIMEOUT", "slow");
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await click(deps, PMID, i % 2 ? USER : OTHER);
      clock.now += 2 * 60 * 60_000;
    }
    assert.equal(store.rows.get(PMID)!.attempts, MAX_ATTEMPTS);
    const last = await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    assert.equal(last.run, null);
    assert.equal((last.response as { retryable: boolean }).retryable, false);
    assert.equal(service.extracts.length, MAX_ATTEMPTS);
  });

  it("a wrong key is logged for the owner, shown to readers as 'not switched on', and does not brick the paper", async () => {
    const { deps, store, service, clock } = setup();
    service.extractError = new VaError("NOT_CONFIGURED", "The service refused the key.");
    await click(deps);
    assert.equal(store.rows.get(PMID)!.error_code, "NOT_CONFIGURED");
    clock.now += RETRY_COOLDOWN_MS + 1;
    service.extractError = null;
    assert.equal((await click(deps)).response.status, "working");
    assert.equal(store.rows.get(PMID)!.status, "ready");
  });

  it("a picture that cannot be saved is a retryable failure, and the findings are kept", async () => {
    const { deps, store, images, service, clock } = setup();
    images.failUploads = true;
    await click(deps);
    assert.equal(store.rows.get(PMID)!.error_code, "STORAGE_FAILED");
    assert.equal((await checkVisualAbstract(deps, PMID)).status, "failed");
    assert.ok(store.rows.get(PMID)!.content, "the findings stay saved");
    clock.now += RETRY_COOLDOWN_MS + 1;
    images.failUploads = false;
    const retry = await click(deps);
    assert.deepEqual(retry.response, { status: "working", step: "draw" });
    assert.equal(store.rows.get(PMID)!.status, "ready");
    assert.equal(store.rows.get(PMID)!.attempts, 2);
    assert.equal(service.extracts.length, 1, "the findings were already paid for: only the drawing is repeated");
    assert.equal(service.renders, 2);
  });

  it("the background work never throws, even when the database is down", async () => {
    const { deps, store } = setup();
    const started = await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    store.failNextWrite = true;
    await assert.doesNotReject(() => started.run!());
  });

  it("every code has plain words, and an unknown code becomes a generic one", () => {
    for (const code of ["MODEL_BUSY", "NO_ABSTRACT", "LIMIT_DAY", "STORAGE_FAILED", "SERVICE_DOWN"] as const) {
      assert.ok(messageFor(code).length > 10);
      assert.doesNotMatch(messageFor(code), /[A-Z_]{6,}/, `${code}: no shouting codes`);
      assert.doesNotMatch(messageFor(code), /\b(?:code|error|exception)\b/i, `${code}: no jargon`);
    }
    assert.equal(asVaErrorCode("MODEL_BUSY"), "MODEL_BUSY");
    assert.equal(asVaErrorCode("SOMETHING_NEW"), "INTERNAL");
    assert.equal(asVaErrorCode(null), "INTERNAL");
    assert.equal(isRetryable("NO_FINDINGS"), false);
    assert.equal(isRetryable("SERVICE_DOWN"), true);
  });
});

describe("a worker that dies does not strand a paper", () => {
  it("findings saved but never drawn are drawn by the next click or status check, once", async () => {
    const { deps, store, service } = setup();
    const started = await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    // The background job saved the findings, then the function was cut off before drawing.
    await store.transition(PMID, ["pending"], "extracting", new Date(T0).toISOString());
    await store.saveContent(PMID, { content: { findings: [1] }, contentVersion: "v", costUsd: 0.04 }, new Date(T0).toISOString());
    void started;
    const [a, b] = await Promise.all([checkVisualAbstract(deps, PMID), checkVisualAbstract(deps, PMID)]);
    assert.equal(store.rows.get(PMID)!.status, "ready");
    assert.equal(service.renders, 1, "two checks, one drawing");
    assert.ok([a, b].some((r) => r.status === "ready"));
    assert.equal(service.extracts.length, 0);
  });

  it("a click on a paper whose findings are saved draws it for free", async () => {
    const { deps, store, service } = setup();
    await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    await store.transition(PMID, ["pending"], "extracting", new Date(T0).toISOString());
    await store.saveContent(PMID, { content: { findings: [1] }, contentVersion: "v", costUsd: 0.04 }, new Date(T0).toISOString());
    const click2 = await requestVisualAbstract(deps, { pmid: PMID, userId: OTHER });
    assert.deepEqual(click2.response, { status: "working", step: "draw" });
    await click2.run!();
    assert.equal(store.rows.get(PMID)!.status, "ready");
    assert.equal(service.extracts.length, 0, "no model call");
    assert.equal(await store.countRequests("1970-01-01T00:00:00.000Z", OTHER), 0, "and it does not count against that person");
  });

  it("a row quiet for too long while reading is marked failed, then a click can start again", async () => {
    const { deps, store, service, clock } = setup();
    await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    await store.transition(PMID, ["pending"], "extracting", new Date(T0).toISOString());
    clock.now += WORKING_STALE_MS - 1000;
    assert.deepEqual(await checkVisualAbstract(deps, PMID), { status: "working", step: "extract" });
    clock.now += 2000;
    const stale = await checkVisualAbstract(deps, PMID);
    assert.equal(stale.status, "failed");
    assert.equal((stale as { code: string }).code, "TIMEOUT");
    clock.now += RETRY_COOLDOWN_MS + 1;
    const retry = await click(deps, PMID, OTHER);
    assert.equal(retry.response.status, "working");
    assert.equal(store.rows.get(PMID)!.status, "ready");
    assert.equal(service.extracts.length, 1);
  });

  it("a row stuck drawing is put back and drawn again", async () => {
    const { deps, store, service, clock } = setup();
    await requestVisualAbstract(deps, { pmid: PMID, userId: USER });
    await store.transition(PMID, ["pending"], "extracting", new Date(T0).toISOString());
    await store.saveContent(PMID, { content: { findings: [1] }, contentVersion: "v", costUsd: 0.04 }, new Date(T0).toISOString());
    await store.transition(PMID, ["extracted"], "rendering", new Date(T0).toISOString());
    assert.deepEqual(await checkVisualAbstract(deps, PMID), { status: "working", step: "draw" });
    clock.now += DRAWING_STALE_MS + 1;
    assert.equal((await checkVisualAbstract(deps, PMID)).status, "ready");
    assert.equal(service.renders, 1);
  });

  it("asking about a paper nobody has started says so, and starts nothing", async () => {
    const { deps, store } = setup();
    assert.deepEqual(await checkVisualAbstract(deps, PMID), { status: "none" });
    assert.equal(store.rows.size, 0);
    assert.equal((await checkVisualAbstract(deps, "abc")).status, "failed");
  });
});

describe("the service client keeps its key on the server and says what went wrong", () => {
  const settings = { url: "https://va.example.com", key: "k".repeat(30) };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("sends the key as a bearer token, the ID as JSON, and reads the findings, version and cost", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const client = createServiceClient(settings, async (url, init) => {
      seen = { url, init };
      return json({ content: { a: 1 }, version: { content: "1.0.0+v1" }, usage: { estimated_usd: 0.05123 } });
    });
    const out = await client.extract(PMID);
    assert.equal(seen!.url, "https://va.example.com/api/v1/extract");
    const headers = seen!.init.headers as Record<string, string>;
    assert.equal(headers.authorization, `Bearer ${settings.key}`);
    assert.equal(seen!.init.body, JSON.stringify({ pmid: PMID }));
    assert.deepEqual(out, { content: { a: 1 }, contentVersion: "1.0.0+v1", costUsd: 0.0512 });
    assert.ok(EXTRACT_TIMEOUT_MS >= 120_000, "longer than the service's own limit");
  });

  it("passes the service's reason through, turns a refused key into 'not configured', and a dead service into 'down'", async () => {
    const reply = (status: number, body: unknown) => createServiceClient(settings, async () => json(body, status));
    await assert.rejects(() => reply(422, { error: { code: "NO_ABSTRACT", message: "x" } }).extract(PMID), { code: "NO_ABSTRACT" });
    await assert.rejects(() => reply(422, { error: { code: "LAYOUT_FAILED", message: "x" } }).render({}), { code: "LAYOUT_FAILED" });
    await assert.rejects(() => reply(503, { error: { code: "MODEL_BUSY", message: "x" } }).extract(PMID), { code: "MODEL_BUSY" });
    await assert.rejects(() => reply(401, { error: { code: "UNAUTHORIZED", message: "x" } }).extract(PMID), { code: "NOT_CONFIGURED" });
    await assert.rejects(() => reply(503, { error: { code: "SERVICE_NOT_CONFIGURED", message: "x" } }).extract(PMID), { code: "NOT_CONFIGURED" });
    await assert.rejects(() => reply(502, "<html>bad gateway</html>").extract(PMID), { code: "SERVICE_DOWN" });
    await assert.rejects(() => reply(400, { error: { code: "BAD_CONTENT", message: "x" } }).render({}), { code: "INTERNAL" });
    const down = createServiceClient(settings, async () => Promise.reject(new TypeError("fetch failed")));
    await assert.rejects(() => down.extract(PMID), { code: "SERVICE_DOWN" });
    const slow = createServiceClient(settings, async () => Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
    await assert.rejects(() => slow.render({}), { code: "TIMEOUT" });
  });

  it("accepts only a PNG for a picture, and an answer with findings for an extraction", async () => {
    const png = new Response(PNG, { status: 200, headers: { "content-type": "image/png", "x-va-render-version": "r7" } });
    assert.deepEqual(await createServiceClient(settings, async () => png).render({}), { png: PNG, renderVersion: "r7" });
    const html = createServiceClient(settings, async () => new Response("<html></html>".repeat(40), { status: 200 }));
    await assert.rejects(() => html.render({}), { code: "SERVICE_DOWN" });
    const huge = createServiceClient(settings, async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(2_100_000).fill(0)]), { status: 200 }));
    await assert.rejects(() => huge.render({}), { code: "SERVICE_DOWN" });
    for (const body of [{}, { content: {} }, { content: { a: 1 } }, { version: { content: "v" } }]) {
      await assert.rejects(() => createServiceClient(settings, async () => json(body)).extract(PMID), { code: "SERVICE_DOWN" }, JSON.stringify(body));
    }
  });
});
