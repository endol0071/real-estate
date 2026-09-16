import { test, expect, type Page } from "@playwright/test";
import { createDemo } from "../fixtures/demo";
import { CriteriaSchema, type Criteria } from "../../lib/schema";

// Synthetic responses live only in tests. Production never loads these fixtures.
function fixture(criteria?: Criteria) {
  const report = createDemo(criteria);
  return { ...report, id: "test-report", mode: "live", headline: "테스트용 검색 결과",
    sources: [{ id: "test", name: "테스트 출처", url: "https://example.com/evidence", kind: "테스트", checkedAt: "2026-09-15" }],
    candidates: report.candidates.map(c => ({ ...c, name: c.name.replace("(가상)", "(테스트)"), sourceIds: ["test"] })) };
}
const resultStream = (criteria?: Criteria) => `event: progress\ndata: {"message":"가격 비교 진행 중"}\n\nevent: result\ndata: ${JSON.stringify(fixture(criteria))}\n\n`;
async function navSaved(page: Page, mobile: boolean, count: number) {
  if (mobile) await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.getByRole("button", { name: new RegExp(`^관심단지\\s*${count}$`) }).click();
}

async function enterCriteria(page: Page) {
  await page.getByRole("button", { name: "조건 입력하고 분석 시작" }).click();
  await expect(page.getByLabel("최소 예산", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("최대 예산", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("직장 또는 주요 목적지")).toHaveValue("");
  await page.getByLabel("최소 예산", { exact: true }).fill("9");
  await page.getByLabel("최대 예산", { exact: true }).fill("11");
  await page.getByLabel("직장 또는 주요 목적지").fill("판교역, 서울대입구역");
}
async function startAnalysis(page: Page) {
  await enterCriteria(page);
  await page.getByRole("button", { name: "내 조건으로 최신 자료 분석" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { liveAvailable: true } }));
  await page.route("**/api/reports", route => route.request().method() === "GET"
    ? route.fulfill({ json: { reports: [] } })
    : route.fulfill({ contentType: "text/event-stream", body: resultStream(CriteriaSchema.parse(route.request().postDataJSON())) }));
});

test("first visit shows no fabricated prices; analysis displays sources and bookmarks persist", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "최신 자료로 나의 다음 집을 찾아보세요" })).toBeVisible();
  await expect(page.getByText("한강 리버포레", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "리포트 내보내기" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "현재 검색 조건" })).toHaveCount(0);
  await startAnalysis(page);
  await expect(page.getByRole("table", { name: "아파트 매매 가격 비교표" })).toBeVisible();
  await page.getByRole("button", { name: "한강 리버포레 (테스트)", exact: true }).click();
  await expect(page.getByRole("link", { name: "테스트 출처", exact: true }).first()).toHaveAttribute("href", "https://example.com/evidence");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByText(/AI 분석·신고 지연 등으로 실제 가격과 다를 수 있습니다/)).toBeVisible();
  for (const title of ["지역 온도표", "가격에 영향을 주는 소식", "30초 시장 요약", "오늘의 한 채"]) await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "한강 리버포레 (테스트)", exact: true }).click();
  await page.getByRole("button", { name: "관심단지에 저장", exact: true }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await navSaved(page, info.project.name === "mobile", 1);
  await expect(page.getByRole("table")).toContainText("한강 리버포레 (테스트)");
  await page.getByRole("button", { name: "한강 리버포레 (테스트) 관심단지 해제" }).click();
  await expect(page.getByRole("heading", { name: "저장된 관심단지가 없습니다" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("form forwards criteria and comparison/export use returned report", async ({ page }) => {
  await page.goto("/");
  await enterCriteria(page);
  await page.getByLabel("제외지역 선택사항").fill("동작구");
  await page.getByRole("button", { name: "내 조건으로 최신 자료 분석" }).click();
  await expect(page.getByRole("button", { name: "한강 리버포레 (테스트)", exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "아파트 매매 가격 비교표" })).toBeVisible();
  await page.getByRole("button", { name: "서울", exact: true }).click();
  await expect(page.getByRole("table")).not.toContainText("평촌");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "리포트 내보내기" }).click();
  expect((await downloading).suggestedFilename()).toContain("live");
  await page.getByLabel("단지명 또는 지역 검색").fill("없는단지");
  await expect(page.getByRole("heading", { name: "조건에 맞는 후보가 없습니다" })).toBeVisible();
});

test("long requests show elapsed time and prevent duplicate execution until result", async ({ page }) => {
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/reports", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { reports: [] } });
    await waiting;
    await route.fulfill({ contentType: "text/event-stream", body: resultStream() });
  });
  await page.goto("/");
  await startAnalysis(page);
  await expect(page.getByRole("heading", { name: "나에게 맞는 집을 찾고 있습니다" })).toBeVisible();
  await expect(page.getByText("0분 01초 경과")).toBeVisible();
  await expect(page.locator(".research-steps > div")).toHaveCount(2);
  await expect(page.locator(".research-steps")).toContainText("검색 중");
  await expect(page.locator(".research-steps")).toContainText("가격 비교 진행 중");
  await expect(page.locator(".research-steps")).not.toContainText("경기 남부");
  await expect(page.getByRole("button", { name: "조건 변경", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "현재 조건으로 분석 시작" })).toHaveCount(0);
  finish();
  await expect(page.getByRole("table", { name: "아파트 매매 가격 비교표" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "나에게 맞는 집을 찾고 있습니다" })).toHaveCount(0);
});

test("failed analysis shows explicit error, no invented data, and can be retried", async ({ page }) => {
  await page.route("**/api/reports", route => route.request().method() === "GET"
    ? route.fulfill({ json: { reports: [] } })
    : route.fulfill({ contentType: "text/event-stream", body: 'event: error\ndata: {"message":"OpenAI API 크레딧이 부족합니다."}\n\n' }));
  await page.goto("/");
  await startAnalysis(page);
  await expect(page.getByRole("alert").filter({ hasText: "OpenAI API 크레딧이 부족합니다." })).toBeVisible();
  await expect(page.getByRole("button", { name: "현재 조건으로 분석 시작" })).toBeEnabled();
  await expect(page.getByRole("table", { name: "아파트 매매 가격 비교표" })).toHaveCount(0);
});

test("missing key disables analysis instead of showing demo", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { liveAvailable: false } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "조건 입력하고 분석 시작" })).toBeDisabled();
  await expect(page.getByText("서버에 API 키를 설정한 후 다시 접속해 주세요.")).toBeVisible();
  await expect(page.getByText("가상", { exact: false })).toHaveCount(0);
});

test("API rejects invalid input and cross-origin execution without paid calls", async ({ request }) => {
  const invalid = await request.post("/api/reports", { data: { minBudget: 15, maxBudget: 9, workplaces: [] } });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await request.post("/api/reports", { headers: { origin: "https://unrelated.example" }, data: {} });
  expect(crossOrigin.status()).toBe(403);
});

test("usage remains visible after a failed comparison without fabricating prices", async ({ page }) => {
  await page.route("**/api/reports", route => route.request().method() === "GET"
    ? route.fulfill({ json: { reports: [] } })
    : route.fulfill({ contentType: "text/event-stream", body: `event: usage\ndata: ${JSON.stringify({ phase: "search", model: "test-model", input: 2000, output: 500, total: 2500, cachedInput: 0, reasoning: 100, webSearchCalls: 2 })}\n\nevent: error\ndata: {"message":"분당 토큰 처리량 제한"}\n\n` }));
  await page.goto("/");
  await startAnalysis(page);
  await expect(page.locator(".error-banner")).toContainText("분당 토큰 처리량 제한");
  await page.getByText("API 사용량 확인", { exact: true }).click();
  await expect(page.getByText(/입력 2,000 \/ 출력 500 \/ 합계 2,500/)).toBeVisible();
  await expect(page.getByRole("table", { name: "아파트 매매 가격 비교표" })).toHaveCount(0);
});

test("listing priority, trade-only labels and reference prices are shown separately", async ({ page }) => {
  const data = fixture();
  const a = { ...data.candidates[0], name: "개별호가단지", askingMin: 10.9, askingMax: 10.9, investmentScore: 1, livingScore: 1 };
  const b = { ...data.candidates[1], name: "실거래단지", askingMin: null, askingMax: null, askingDate: null, askingSourceIds: [], investmentScore: 99, livingScore: 99 };
  const reference = { ...data.candidates[2], name: "평균가단지", askingMin: null, askingMax: null, askingDate: null, askingSourceIds: [], trades: [], referencePrices: [{ kind: "매물평균가", value: 9.93, date: "2026-09-15", area: null, sourceIds: ["test"] }] };
  await page.route("**/api/reports", route => route.request().method() === "GET" ? route.fulfill({ json: { reports: [] } }) : route.fulfill({ contentType: "text/event-stream", body: `event: result\ndata: ${JSON.stringify({ ...data, candidates: [b, a], referenceCandidates: [reference] })}\n\n` }));
  await page.goto("/");
  await startAnalysis(page);
  const tables = page.getByRole("table", { name: "아파트 매매 가격 비교표" });
  await expect(tables.first().locator("tbody tr").first()).toContainText("개별호가단지");
  await expect(tables.first()).toContainText("현재 호가 확인 필요");
  await expect(page.getByRole("heading", { name: "시세 참고 단지" })).toBeVisible();
  await expect(tables.nth(1)).toContainText("매물평균가 9.93억");
  await expect(tables.nth(1).locator(".price-asking > strong")).toHaveText("미확인");
});
