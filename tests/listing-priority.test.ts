import { test } from "node:test";
import assert from "node:assert/strict";
import { userBriefingFixture } from "./fixtures/user-briefing";
import { DEFAULT_CRITERIA, type Candidate } from "../lib/schema";
import { validateAnalysis } from "../lib/validation";
import { compareRecommendations, priceBasis } from "../lib/price-basis";

const asOf = "2026-09-15";
function evaluate(candidate: Candidate) {
  const report = userBriefingFixture();
  return validateAnalysis({ ...report, candidates: [candidate] }, DEFAULT_CRITERIA, new Set(report.sources.map(s => s.url)), undefined, asOf);
}
function base(): Candidate { return { ...userBriefingFixture().candidates[0], area: 59.99, listings: [], referencePrices: [] }; }
const listing = (price: number, area = 59.99) => ({ price, area, floor: "미확인", checkedAt: "2026-09-14", sourceIds: ["claim0"] });

test("individual listing drives eligibility and outranks higher-scored trade-only candidates", () => {
  const c = base();
  const result = evaluate({ ...c, listings: [listing(9.9)], investmentScore: 1, livingScore: 1 }).candidates[0];
  assert.equal(result.askingMin, 9.9);
  assert.equal(priceBasis(result), "개별 호가 확인");
  const tradeOnly = { ...c, investmentScore: 99, livingScore: 99 };
  assert.equal([tradeOnly, result].sort(compareRecommendations)[0], result);
});
test("over-budget actual listings cannot be rescued by cheap historical trades or averages", () => {
  const c = base();
  const result = evaluate({ ...c, listings: [listing(11.5)], referencePrices: [{ kind: "KB시세", value: 10.5, date: asOf, area: c.area, sourceIds: ["claim0"] }] });
  assert.equal(result.candidates.length, 0); assert.equal(result.referenceCandidates?.length, 0);
  assert.equal(evaluate({ ...c, listings: [listing(8), listing(12)] }).candidates.length, 0);
});
test("average-only data stays in reference section and never fills current asking price", () => {
  const c = base();
  const result = evaluate({ ...c, trades: [], askingMin: 10.75, askingMax: 10.75, askingDate: asOf, askingSourceIds: ["claim0"], referencePrices: [{ kind: "매물평균가", value: 10.75, date: asOf, area: null, sourceIds: ["claim0"] }] });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.referenceCandidates?.length, 1);
  assert.equal(result.referenceCandidates?.[0].askingMin, null);
  assert.equal(result.referenceCandidates?.[0].referencePrices?.[0].value, 10.75);
});
test("trade-only candidates survive but cannot be described as current verified listings", () => {
  const result = evaluate({ ...base(), status: "매수검토" }).candidates[0];
  assert.equal(result.status, "가격대기");
  assert.equal(priceBasis(result), "현재 호가 확인 필요");
  assert.equal(result.askingMin, null);
});
test("wrong area, stale date and unknown source cannot substantiate individual listings", () => {
  for (const l of [listing(9.9, 84.97), { ...listing(9.9), checkedAt: "2026-01-01" }, { ...listing(9.9), sourceIds: ["unknown"] }]) {
    const result = evaluate({ ...base(), listings: [l] });
    assert.equal(result.candidates[0].askingMin, null);
    assert.equal(result.candidates[0].trades.length, 1);
  }
});
