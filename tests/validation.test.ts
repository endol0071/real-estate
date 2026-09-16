import { test } from "node:test";
import assert from "node:assert/strict";
import { CriteriaSchema, DEFAULT_CRITERIA, ReportSchema } from "../lib/schema";
import { createDemo } from "./fixtures/demo";
import { eligible, isExcluded, priceChanges, safeUrl, validateAnalysis } from "../lib/validation";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readReports, saveReport } from "../lib/store";

test("exclusions are optional and not hardcoded", () => {
  const parsed = CriteriaSchema.parse({ minBudget: 9, maxBudget: 11, workplaces: ["판교역"] });
  assert.deepEqual(parsed.excludedRegions, []);
  assert.equal(parsed.minArea, 59);
  assert.equal(parsed.commuteMinutes, 60);
  assert.equal(isExcluded({ region: "서울 노원구", address: "서울특별시 노원구 상계동" }, parsed.excludedRegions), false);
});
test("reject reversed budgets, empty workplaces and excessive inputs", () => {
  assert.equal(CriteriaSchema.safeParse({ ...DEFAULT_CRITERIA, minBudget: 12 }).success, false);
  assert.equal(CriteriaSchema.safeParse({ ...DEFAULT_CRITERIA, workplaces: [] }).success, false);
  assert.equal(CriteriaSchema.safeParse({ ...DEFAULT_CRITERIA, workplaces: [" "] }).success, false);
  assert.equal(CriteriaSchema.safeParse({ ...DEFAULT_CRITERIA, excludedRegions: Array(31).fill("서울") }).success, false);
});
test("region filtering includes subareas and normalizes province aliases", () => {
  assert.equal(isExcluded({ region: "서울 은평구", address: "서울특별시 은평구 불광동 1" }, ["은평구 불광동"]), true);
  assert.equal(isExcluded({ region: "경기 안양시 동안구", address: "경기도 안양시 동안구 비산동" }, ["경기도 안양시"]), true);
  assert.equal(isExcluded({ region: "서울 은평구", address: "서울 은평구 녹번동" }, ["불광동"]), false);
});
test("asking ranges take priority; stale cheaper trades don't admit over-budget listings", () => {
  const candidate = createDemo().candidates[0];
  assert.equal(eligible({ ...candidate, askingMin: 11.1, askingMax: 12 }, DEFAULT_CRITERIA), false);
  assert.equal(eligible({ ...candidate, askingMin: null, askingMax: null }, DEFAULT_CRITERIA), true);
  assert.equal(eligible({ ...candidate, area: 58.99 }, DEFAULT_CRITERIA), false);
});
test("price changes use same candidate's exact area trades; same day differences are not temporal changes", () => {
  const candidate = createDemo().candidates[0];
  const trades = [{ value: 10, date: "2026-08-01", floor: "5층", sourceIds: ["a"] }, { value: 10.3, date: "2026-09-01", floor: "10층", sourceIds: ["b"] }];
  const changes = priceChanges([{ ...candidate, trades }]);
  assert.equal(changes.length, 1); assert.equal(changes[0].percent, 3);
  assert.match(changes[0].basis, /전일 대비 아님/);
  assert.equal(priceChanges([{ ...candidate, trades: [trades[0], { ...trades[1], date: trades[0].date }] }]).length, 0);
  assert.equal(priceChanges([{ ...candidate, trades: [trades[0]] }]).length, 0);
});
test("unobserved and unsafe citations cannot substantiate prices or recommendations", () => {
  const demo = createDemo();
  const output = validateAnalysis({ ...demo, sources: [{ id: "fake", url: "https://fake.example/price", name: "fake", checkedAt: "2026-09-15", kind: "가격" }], candidates: [{ ...demo.candidates[0], sourceIds: ["fake"], askingSourceIds: ["fake"] }] }, DEFAULT_CRITERIA, new Set());
  assert.equal(output.candidates.length, 0); assert.equal(output.pickId, null); assert.equal(output.sources.length, 0);
  assert.equal(safeUrl("javascript:alert(1)"), false); assert.equal(safeUrl("https://user:pass@example.com"), false);
});
test("source-backed recent trades survive; future prices and excluded narrative are removed", () => {
  const demo = createDemo();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const url = "https://rt.molit.go.kr/test-evidence";
  const sources = [{ id: "official", name: "국토부 테스트 자료", url, kind: "테스트", checkedAt: today }];
  const candidate = { ...demo.candidates[0], sourceIds: ["official"], askingSourceIds: [], trades: [{ value: 10, date: today, floor: "10층", sourceIds: ["official"] }] };
  const output = validateAnalysis({ ...demo, sources, candidates: [candidate], scan: [{ title: "노원구 후보", body: "제외될 서술", sourceIds: ["official"] }] }, { ...DEFAULT_CRITERIA, excludedRegions: ["노원구"] }, new Set([url]));
  assert.equal(output.candidates.length, 1); assert.equal(output.candidates[0].askingMin, null); assert.equal(output.scan.length, 0);
  const future = validateAnalysis({ ...demo, sources, candidates: [{ ...candidate, trades: [{ ...candidate.trades[0], date: "2999-01-01" }] }] }, DEFAULT_CRITERIA, new Set([url]));
  assert.equal(future.candidates.length, 0);
});
test("demo satisfies API report schema and never persists as real data", () => {
  const report = ReportSchema.parse(createDemo({ ...DEFAULT_CRITERIA, excludedRegions: ["동작구"] }));
  assert.equal(report.mode, "demo"); assert.ok(report.candidates.every(c => !c.address.includes("동작구")));
  assert.ok(report.candidates.every(c => c.name.includes("가상")));
  assert.equal(createDemo({ ...DEFAULT_CRITERIA, minBudget: 1, maxBudget: 2 }).candidates.length, 0);
});
test("report storage isolates sessions and atomically saves history", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "jipnote-test-"));
  const previous = process.env.DATA_DIR; process.env.DATA_DIR = dir;
  try {
    const a = randomUUID(), b = randomUUID();
    const report = { ...createDemo(), id: randomUUID() };
    await saveReport(a, report);
    assert.equal((await readReports(a))[0].id, report.id);
    assert.deepEqual(await readReports(b), []);
    await assert.rejects(() => readReports("../../sensitive"));
  } finally { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(dir, { recursive: true, force: true }); }
});
