import { researchModel } from "./research-models";
import { cachedSearch, saveSearch, searchKey } from "./search-cache";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { randomUUID } from "node:crypto";
import { type ApiUsage, type Criteria, type Report } from "./schema";
import { safeUrl } from "./validation";
import { withRateLimitRetry } from "./api-retry";
import { emptyReport } from "./empty-report";
import { recordUsage } from "./usage";
import { collectPrices, DiscoveryOutputSchema, PriceOutputSchema, normalizePriceOutput } from "./price-research";

export async function research(criteria: Criteria, progress: (message: string) => void, signal: AbortSignal,
  onUsage: (usage: ApiUsage) => void = () => {}, session?: string): Promise<Report> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 90_000 });
  const usage: ApiUsage[] = [];
  let reused = 0;
  const result = await collectPrices(criteria, async task => {
    const { model, effort } = researchModel(task.stage);
    // Reasoning shares the output budget; discovery needs room for both reasoning and leads.
    const maxOutput = task.stage === "discover" ? 3500 : task.maxOutput;
    const key = searchKey(task.input, `${task.instructions}\n${effort}:${maxOutput}`, model);
    const cached = session ? await cachedSearch(session, key) : undefined;
    if (cached) { reused++; return { data: task.stage === "prices" ? normalizePriceOutput(JSON.parse(cached.outputText)) : JSON.parse(cached.outputText), urls: new Set(cached.urls) }; }
    const format = task.stage === "discover"
      ? zodTextFormat(DiscoveryOutputSchema, "apartment_leads") : zodTextFormat(PriceOutputSchema, "apartment_prices");
    const response = await withRateLimitRetry(() => client.responses.create({
      model, store: false, max_output_tokens: maxOutput, reasoning: { effort },
      tools: [{ type: "web_search", search_context_size: "low" }],
      tool_choice: "required", include: ["web_search_call.action.sources"],
      instructions: task.instructions, input: task.input, text: { format },
    }, { signal }), signal, progress);
    const entry = recordUsage(response, "search", model);
    if (entry) { usage.push(entry); onUsage(entry); }

    const urls = new Set<string>();
    for (const item of response.output) {
      if (item.type === "message") for (const content of item.content) {
        if (content.type === "output_text") for (const a of content.annotations) {
          if (a.type === "url_citation" && safeUrl(a.url)) urls.add(a.url);
        }
      }
      if (item.type === "web_search_call") {
        if (item.action.type === "search") for (const source of item.action.sources ?? []) if (safeUrl(source.url)) urls.add(source.url);
        if (item.action.type === "open_page" && item.action.url && safeUrl(item.action.url)) urls.add(item.action.url);
      }
    }
    if (session) await saveSearch(session, { key, stage: task.stage, createdAt: new Date().toISOString(), status: response.status ?? "unknown", outputText: response.output_text, urls: [...urls] });
    if (response.status !== "completed") throw Object.assign(new Error("검색 응답 미완료"), { code: "analysis_incomplete" });
    return { data: task.stage === "prices" ? normalizePriceOutput(JSON.parse(response.output_text)) : JSON.parse(response.output_text), urls };
  }, progress, signal);
  return { ...emptyReport(), ...result, id: randomUUID(), createdAt: new Date().toISOString(), mode: "live", criteria, usage, limitations: [...result.limitations, ...(reused ? [`30분 이내 동일 조건의 검색 응답 ${reused}개를 재사용했습니다. 해당 요청의 추가 API 호출은 없습니다.`] : [])] };
}
