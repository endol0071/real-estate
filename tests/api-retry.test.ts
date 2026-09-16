import { test } from "node:test";
import assert from "node:assert/strict";
import { errorDiagnostics, retryDelay, sequentialSettled, withRateLimitRetry } from "../lib/api-retry";

test("transient throttling retries with Retry-After then succeeds", async () => {
  let calls = 0; const waits: number[] = []; const messages: string[] = [];
  const result = await withRateLimitRetry(async () => {
    if (++calls < 3) throw { status: 429, code: "rate_limit_exceeded", message: "Tokens per min (TPM)", headers: new Headers({ "retry-after": "2" }) };
    return "success";
  }, new AbortController().signal, m => messages.push(m), async ms => { waits.push(ms); });
  assert.equal(result, "success"); assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 2000]); assert.match(messages[0], /분당 토큰 처리량/);
});
test("quota failures and long server cooldowns are not retried", async () => {
  for (const error of [{ status: 429, code: "credit_balance_exhausted" }, { status: 429, type: "insufficient_quota" }, { status: 429, headers: new Headers({ "retry-after": "120" }) }]) {
    let calls = 0;
    await assert.rejects(() => withRateLimitRetry(async () => { calls++; throw error; }, new AbortController().signal, () => {}, async () => assert.fail("unexpected retry")));
    assert.equal(calls, 1);
  }
  assert.equal(retryDelay({}, 0), 15000);
});
test("cancel during cooldown prevents further API requests", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(() => withRateLimitRetry(async () => { calls++; throw { status: 429 }; }, controller.signal, () => {}, async () => { controller.abort(); }));
  assert.equal(calls, 1);
});
test("searches are sequential and retain partial failures", async () => {
  let active = 0; let maximum = 0;
  const results = await sequentialSettled([1, 2, 3], async item => {
    active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--;
    if (item === 2) throw new Error("search failure"); return item;
  }, new AbortController().signal);
  assert.equal(maximum, 1);
  assert.deepEqual(results.map(r => r.status), ["fulfilled", "rejected", "fulfilled"]);
});
test("diagnostics never include raw API errors or credentials", () => {
  const result = errorDiagnostics({ status: 429, code: "rate_limit_exceeded", message: "requests per minute secret-key", request_id: "sensitive" });
  assert.deepEqual(result, { status: 429, code: "rate_limit_exceeded", rateLimit: "분당 요청 수" });
});
