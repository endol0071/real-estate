import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CRITERIA } from "../lib/schema";
import { eligible, validateAnalysis } from "../lib/validation";
import { userBriefingFixture } from "./fixtures/user-briefing";

test("supplied briefing mixes in-budget candidates with area and price exceptions", () => {
  const data = userBriefingFixture();
  assert.deepEqual(data.candidates.map(c => eligible(c, DEFAULT_CRITERIA)), [true, false, false, false, false]);
  assert.equal(eligible(data.candidates[3], { ...DEFAULT_CRITERIA, minBudget: 0.5 }), true);
});
test("given linked evidence the supplied July 25 trade survives all filters as of September 15", () => {
  const data = userBriefingFixture();
  // Simulate source matching to isolate filters; this is NOT a claim that these URLs were read.
  const linked = new Set(data.sources.map(s => s.url));
  const reasons: string[][] = [];
  const result = validateAnalysis(data, DEFAULT_CRITERIA, linked, r => reasons.push(r), "2026-09-15");
  assert.deepEqual(result.candidates.map(c => c.name), ["신도림롯데"]);
  assert.equal(result.candidates[0].trades[0].value, 11);
  assert.equal(result.candidates[0].askingMin, null);
  assert.ok(reasons.some(r => r.includes("최소 면적 미달")));
  assert.ok(reasons.some(r => r.includes("실거래 날짜 형식·기간 불충족")));
});
test("pasted links alone do not become tool-observed evidence", () => {
  assert.equal(validateAnalysis(userBriefingFixture(), DEFAULT_CRITERIA, new Set(), undefined, "2026-09-15").candidates.length, 0);
});
