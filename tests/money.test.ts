import { test } from "node:test";
import assert from "node:assert/strict";
import { toEok } from "../lib/money";
import { normalizePriceOutput, selectLeads } from "../lib/price-research";
import { DEFAULT_CRITERIA } from "../lib/schema";
import { userBriefingFixture } from "./fixtures/user-briefing";

test("explicit won, ten-thousand won and eok values become the same internal price", () => {
  assert.equal(toEok(990000000, "원"), 9.9);
  assert.equal(toEok(99000, "만원"), 9.9);
  assert.equal(toEok(9.9, "억원"), 9.9);
  assert.equal(toEok(1180000000, "원"), 11.8);
});
test("all price categories are normalized before validation; missing units cannot be guessed", () => {
  const base = userBriefingFixture();
  const raw = { ...base, candidates: [{ ...base.candidates[0], trades: [{ ...base.candidates[0].trades[0], value: 1090000000, unit: "원" }],
    listings: [{ price: 110000, unit: "만원", area: 60, checkedAt: "2026-09-15", floor: "3층", sourceIds: ["claim0"] }],
    referencePrices: [{ value: 10.75, unit: "억원", kind: "매물평균가", date: "2026-09-15", area: 60, sourceIds: ["claim0"] }],
  }] };
  const c = normalizePriceOutput(raw).candidates[0];
  assert.equal(c.trades[0].value, 10.9);
  assert.equal(c.listings[0].price, 11);
  assert.equal(c.referencePrices[0].value, 10.75);
  assert.throws(() => normalizePriceOutput({ ...raw, candidates: [{ ...raw.candidates[0], trades: [{ ...base.candidates[0].trades[0], value: 1090000000 }] }] }));
});
test("known wrong-budget or undersized leads do not consume individual lookup calls", () => {
  const lead = { name: "테스트", address: "서울 동작구", area: 60, url: "https://example.com/apt/1" };
  const result = selectLeads([[{ ...lead, name: "저가", priceHint: { value: 680000000, unit: "원" } }, { ...lead, name: "고가", priceHint: { value: 15.4, unit: "억원" } }, { ...lead, name: "소형", area: 58.59, priceHint: { value: 10, unit: "억원" } }, { ...lead, name: "적합", priceHint: { value: 99000, unit: "만원" } }]], DEFAULT_CRITERIA);
  assert.deepEqual(result.map(c => c.name), ["적합"]);
});
