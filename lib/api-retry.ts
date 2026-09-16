import { setTimeout as delay } from "node:timers/promises";

type ApiError = { status?: number; code?: string; type?: string; message?: string; headers?: Headers; request_id?: string };
export function isTransientRateLimit(error: unknown) {
  const e = error as ApiError | null;
  return e?.status === 429 && e.code !== "credit_balance_exhausted" && e.code !== "insufficient_quota" && e.type !== "insufficient_quota";
}
export function tokenLimitDetails(error: unknown) {
  const message = (error as ApiError | null)?.message ?? "";
  const read = (label: string) => { const match = message.match(new RegExp(`\\b${label}:?\\s*([0-9]+)`, "i")); return match ? Number(match[1]) : undefined; };
  return { limit: read("Limit"), used: read("Used"), requested: read("Requested") };
}
export function resetDuration(raw: string | null): number {
  if (!raw) return 0;
  let ms = 0;
  for (const match of raw.matchAll(/([\d.]+)(ms|s|m|h)/g)) ms += Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2]] ?? 0);
  return ms;
}
export function retryDelay(error: unknown, attempt: number): number {
  const raw = (error as ApiError | null)?.headers?.get("retry-after");
  if (raw) {
    const seconds = Number(raw);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
    if (Number.isFinite(ms)) return Math.max(1000, ms);
  }
  const headers = (error as ApiError | null)?.headers;
  const reset = Math.max(resetDuration(headers?.get("x-ratelimit-reset-tokens") ?? null), resetDuration(headers?.get("x-ratelimit-reset-requests") ?? null));
  return reset > 0 ? Math.ceil(reset) + 1000 : Math.min(60_000, 15_000 * 2 ** attempt);
}
export function rateLimitKind(error: unknown) {
  const message = (error as ApiError | null)?.message ?? "";
  if (/tokens per min|tokens per minute|\bTPM\b/i.test(message)) return "분당 토큰 처리량";
  if (/requests per min|requests per minute|\bRPM\b/i.test(message)) return "분당 요청 수";
  return "요청 처리량";
}
export async function withRateLimitRetry<T>(operation: () => Promise<T>, signal: AbortSignal, progress: (message: string) => void,
  wait: (ms: number, signal: AbortSignal) => Promise<unknown> = (ms, signal) => delay(ms, undefined, { signal })) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await operation(); } catch (error) {
      if (!isTransientRateLimit(error) || attempt >= 2) throw error;
      console.warn("[OpenAI rate limit]", JSON.stringify(errorDiagnostics(error)));
      const { limit, requested } = tokenLimitDetails(error);
      if (limit && requested && requested > limit) throw error; // Waiting cannot make an oversized request fit.
      const ms = retryDelay(error, attempt);
      // Respect long server cooldowns by failing, instead of retrying too early.
      if (ms > 60_000) throw error;
      progress(`OpenAI ${rateLimitKind(error)} 제한 · ${Math.ceil(ms / 1000)}초 후 재시도 (${attempt + 1}/2)`);
      await wait(ms, signal);
    }
  }
}

// Keep the original order and partial-failure reporting without four simultaneous requests.
export async function sequentialSettled<T, U>(items: T[], operation: (item: T) => Promise<U>, signal: AbortSignal): Promise<PromiseSettledResult<U>[]> {
  const results: PromiseSettledResult<U>[] = [];
  for (const item of items) {
    signal.throwIfAborted();
    try { results.push({ status: "fulfilled", value: await operation(item) }); }
    catch (reason) { signal.throwIfAborted(); results.push({ status: "rejected", reason });
      // Quota and auth errors affect every region: do not repeat paid requests.
      const e = reason as ApiError;
      if (e.status === 401 || e.status === 403 || e.code === "credit_balance_exhausted" || e.type === "insufficient_quota" || e.code === "insufficient_quota") throw reason;
    }
  }
  return results;
}

export function errorDiagnostics(error: unknown) {
  const e = error as ApiError | null;
  // Never expose API keys, raw upstream messages, user inputs or organization identifiers.
  const code = e?.code && /^[a-z_0-9-]{1,80}$/i.test(e.code) ? e.code : undefined;
  const details = tokenLimitDetails(error);
  return { ...(details.limit ? { tokens: details } : {}), status: e?.status, code, rateLimit: isTransientRateLimit(error) ? rateLimitKind(error) : undefined };
}
