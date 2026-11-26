import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summaryRunFailedCompletely } from "./summaryRun";

describe("summaryRunFailedCompletely", () => {
  it("fails only when every attempt saved nothing", () => {
    assert.equal(summaryRunFailedCompletely(12, 0), true);
    assert.equal(summaryRunFailedCompletely(12, 1), false);
    assert.equal(summaryRunFailedCompletely(0, 0), false);
  });
});
