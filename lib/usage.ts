import type { ApiUsage } from "./schema";

type MeteredResponse = {
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number;
    input_tokens_details?: { cached_tokens: number }; output_tokens_details?: { reasoning_tokens: number } } | null;
  output: { type: string }[];
};
export function recordUsage(response: MeteredResponse, phase: ApiUsage["phase"], model: string): ApiUsage | null {
  if (!response.usage) return null; // Missing usage is unknown, never zero.
  const u = response.usage;
  return { phase, model, input: u.input_tokens, output: u.output_tokens, total: u.total_tokens,
    cachedInput: u.input_tokens_details?.cached_tokens ?? 0, reasoning: u.output_tokens_details?.reasoning_tokens ?? 0,
    webSearchCalls: response.output.filter(o => o.type === "web_search_call").length };
}
