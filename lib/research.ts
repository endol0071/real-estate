import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { randomUUID } from "node:crypto";
import { AnalysisSchema, type Criteria, type Report } from "./schema";
import { SYSTEM_PROMPT, SEARCH_GROUPS, criteriaPrompt } from "./prompt";
import { priceChanges, safeUrl, validateAnalysis } from "./validation";

export async function research(criteria: Criteria, previous: Report | undefined, progress: (message: string) => void, signal: AbortSignal): Promise<Report> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 150_000 });
  const model = process.env.OPENAI_MODEL || "gpt-5.4";
  const observedUrls = new Set<string>();
  const coverage: Report["coverage"] = [];
  progress("서울·경기 3개 권역과 정책·교통 자료를 검색합니다.");
  const results = await Promise.allSettled(SEARCH_GROUPS.map(async group => {
    const response = await client.responses.create({
      model, store: false, max_output_tokens: 6500,
      tools: [{ type: "web_search", search_context_size: "high" }],
      tool_choice: "required", include: ["web_search_call.action.sources"],
      instructions: SYSTEM_PROMPT,
      input: `${criteriaPrompt(criteria)}\n담당 검색 범위: ${group.scope}\n최신 자료를 실제 검색하고 출처 링크와 기준일을 붙여 조사 메모를 작성하라. 후보의 주소, 전용면적, 2~3개월 개별 실거래, 현재 호가를 구분. 지역별 확인/자료부족을 명시.`,
    }, { signal });
    if (response.status !== "completed") throw new Error("검색 응답 미완료");
    for (const item of response.output) {
      if (item.type === "message") for (const content of item.content) {
        if (content.type === "output_text") for (const a of content.annotations) {
          if (a.type === "url_citation" && safeUrl(a.url)) observedUrls.add(a.url);
        }
      }
      if (item.type === "web_search_call" && item.action.type === "search") {
        for (const source of item.action.sources ?? []) if (safeUrl(source.url)) observedUrls.add(source.url);
      }
    }
    progress(`${group.name} 검색을 마쳤습니다.`);
    return response.output_text;
  }));
  const notes = results.flatMap((result, i) => {
    coverage.push({ name: SEARCH_GROUPS[i].name, status: result.status === "fulfilled" ? "완료" : "실패", note: result.status === "fulfilled" ? "권역 웹 검색 완료 · 개별 단지 전수조회 아님" : "자료 수집 실패 · 이번 분석 범위에서 누락" });
    return result.status === "fulfilled" ? [`[${SEARCH_GROUPS[i].name}]\n${result.value}`] : [];
  });
  if (!notes.length || !observedUrls.size) throw new Error("검색 출처를 확보하지 못했습니다. API 권한과 네트워크를 확인한 뒤 다시 시도해 주세요.");
  progress("검색 근거를 교차 비교하고 예산·면적·제외지역을 검증합니다.");
  const response = await client.responses.parse({
    model, store: false, max_output_tokens: 14000,
    instructions: SYSTEM_PROMPT + "\n제공된 검색 메모만 사용해 구조화하라. sources URL은 제공된 열람 URL 목록만 사용하라. sourceIds는 sources의 id를 참조한다. 후보 id는 주소+단지명+면적의 안정적 문자열이다. excludedRegions는 별칭/하위지역까지 해석하여 모든 후보 및 후보 관련 서술에서 제외하라. 뉴스/숫자/호가/거래는 반드시 출처를 붙인다. 미확인 사실을 보완해 만들지 말라.",
    input: `${criteriaPrompt(criteria)}\n이전 동일 조건 리포트(없으면 최초 분석): ${previous ? JSON.stringify({ date: previous.createdAt, candidates: previous.candidates.map(c => ({ name: c.name, address: c.address, area: c.area, status: c.status, trades: c.trades, askingMin: c.askingMin })) }) : "없음"}\n검색 메모:\n${notes.join("\n\n")}\n열람 URL: ${JSON.stringify([...observedUrls])}`,
    text: { format: zodTextFormat(AnalysisSchema, "real_estate_report") },
  }, { signal });
  if (response.status !== "completed" || !response.output_parsed) throw new Error("분석 결과가 완성되지 않았습니다. 다시 시도해 주세요.");
  const analysis = validateAnalysis(response.output_parsed, criteria, observedUrls);
  return { ...analysis, id: randomUUID(), createdAt: new Date().toISOString(), mode: "live", criteria,
    changes: priceChanges(analysis.candidates), coverage,
    limitations: [...analysis.limitations, ...coverage.filter(c => c.status === "실패").map(c => `${c.name} 검색 실패: 해당 권역 비교가 불완전합니다.`)],
  };
}
