import { test } from "node:test";
import assert from "node:assert/strict";
import { collectPrices, selectLeads, type Search } from "../lib/price-research";
import { DEFAULT_CRITERIA, type Candidate } from "../lib/schema";
import { createDemo } from "./fixtures/demo";

const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const url = "https://example.com/apartment/1";
const lead = { name: "테스트단지", address: "서울 동작구 상도동", area: null, url };
function evidence(name = lead.name, address = lead.address, value = 10) {
  const candidate: Candidate = { ...createDemo().candidates[0], name, address,
    askingMin: null, askingMax: null, askingDate: null, askingSourceIds: [], sourceIds: ["s1"], factors: [],
    trades: [{ value, date: today, floor: "5층", sourceIds: ["s1"] }] };
  return { candidates: [candidate], sources: [{ id: "s1", url, name: "테스트 출처", kind: "실거래", checkedAt: today }], limitations: [] };
}
const signal = () => new AbortController().signal;

test("discovery without prices is followed by targeted lookup and preserves trade-only evidence", async () => {
  const stages: string[] = []; const progress: string[] = [];
  const search: Search = async req => {
    stages.push(req.stage);
    if (req.stage === "discover") return { data: { leads: [lead], gaps: [] }, urls: new Set([url]) };
    assert.match(req.input, /테스트단지 실거래가/); assert.match(req.input, /매매 매물 호가/);
    return { data: evidence(), urls: new Set([url]) };
  };
  const result = await collectPrices(DEFAULT_CRITERIA, search, m => progress.push(m), signal());
  assert.deepEqual(stages, ["discover", "discover", "discover", "prices"]);
  assert.deepEqual(progress, ["검색 중", "가격 비교 진행 중"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].askingMin, null);
  assert.equal(result.candidates[0].trades[0].value, 10);
  assert.deepEqual(result.candidates[0].trades[0].sourceIds, ["lookup0-s1"]);
});

test("lead selection deduplicates, excludes regions and fairly caps targeted searches", () => {
  const groups = ["서울", "경기", "서부"].map(region => Array.from({ length: 5 }, (_, i) => ({ ...lead, name: `${region}${i}`, address: `${region} 테스트동` })));
  assert.deepEqual(selectLeads(groups, DEFAULT_CRITERIA).map(l => l.name), ["서울0", "경기0", "서부0", "서울1", "경기1", "서부1", "서울2", "경기2"]);
  assert.equal(selectLeads([[lead, lead]], DEFAULT_CRITERIA).length, 1);
  assert.equal(selectLeads([[lead]], { ...DEFAULT_CRITERIA, excludedRegions: ["동작구"] }).length, 0);
});

test("unobserved discovery URLs cannot trigger follow-up requests", async () => {
  let calls = 0;
  await assert.rejects(collectPrices(DEFAULT_CRITERIA, async req => {
    calls++; assert.equal(req.stage, "discover");
    return { data: { leads: [lead], gaps: [] }, urls: new Set() };
  }, () => {}, signal()), { code: "no_verified_prices" });
  assert.equal(calls, 3);
});

test("lookup source ids stay isolated and partial failures keep verified candidates", async () => {
  const second = { ...lead, name: "둘째단지" }; const third = { ...lead, name: "실패단지" };
  const result = await collectPrices(DEFAULT_CRITERIA, async req => {
    if (req.stage === "discover") return { data: { leads: [lead, second, third], gaps: [] }, urls: new Set([url]) };
    if (req.input.includes("실패단지")) throw new Error("timeout");
    return { data: evidence(req.input.includes("둘째단지") ? second.name : lead.name), urls: new Set([url]) };
  }, () => {}, signal());
  assert.equal(result.candidates.length, 2);
  assert.equal(new Set(result.sources.map(s => s.id)).size, 2);
  assert.ok(result.coverage.some(c => c.name === "실패단지" && c.status === "실패"));
});

test("wrong locations and unsupported prices never become successful empty reports", async () => {
  for (const data of [evidence(lead.name, "경기 수원시"), evidence(lead.name, lead.address, 30)]) {
    await assert.rejects(collectPrices(DEFAULT_CRITERIA, async req => ({ data: req.stage === "discover" ? { leads: [lead], gaps: [] } : data, urls: new Set([url]) }), () => {}, signal()), { code: "no_verified_prices" });
  }
});

test("cancellation and account-wide failures stop remaining searches", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(collectPrices(DEFAULT_CRITERIA, async () => { calls++; controller.abort(); return { data: { leads: [lead], gaps: [] }, urls: new Set([url]) }; }, () => {}, controller.signal));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(collectPrices(DEFAULT_CRITERIA, async () => { calls++; throw { status: 429 }; }, () => {}, signal()));
  assert.equal(calls, 1);
});

test("same apartment survives name suffix, road address and tracking URL variations", async () => {
  const sourceUrl = url + "?utm_source=search";
  const result = await collectPrices(DEFAULT_CRITERIA, async req => {
    if (req.stage === "discover") return { data: { leads: [{ ...lead, url: sourceUrl }], gaps: [] }, urls: new Set([url]) };
    return { data: evidence(lead.name + "아파트", "서울특별시 동작구 상도로 123"), urls: new Set([sourceUrl]) };
  }, () => {}, signal());
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].trades[0].value, 10);
});

test("collection failures report whether data was missing, malformed or filtered", async () => {
  await assert.rejects(collectPrices(DEFAULT_CRITERIA, async req => ({
    data: req.stage === "discover" ? { leads: [lead], gaps: [] } : evidence(lead.name, "서울 강남구 역삼동"), urls: new Set([url]),
  }), () => {}, signal()), error => {
    const e = error as { collection: { discovered: number; selected: number; returned: number; identityMatched: number } };
    assert.equal(e.collection.discovered, 3); assert.equal(e.collection.selected, 1);
    assert.equal(e.collection.returned, 1); assert.equal(e.collection.identityMatched, 0);
    return true;
  });
});

test("a valid price citation survives an unresolved secondary citation and absent top-level refs", async () => {
  const data = evidence();
  data.candidates[0].sourceIds = [];
  data.candidates[0].trades[0].sourceIds.push("missing-secondary");
  const result = await collectPrices(DEFAULT_CRITERIA, async req => ({ data: req.stage === "discover" ? { leads: [lead], gaps: [] } : data, urls: new Set([url]) }), () => {}, signal());
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].trades[0].sourceIds, ["lookup0-s1"]);
});
