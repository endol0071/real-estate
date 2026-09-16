import { test } from "node:test";
import assert from "node:assert/strict";
import { recordUsage } from "../lib/usage";
import { retryDelay, tokenLimitDetails, withRateLimitRetry } from "../lib/api-retry";

test("usage records actual totals without double counting cached/reasoning subsets", () => {
  const entry = recordUsage({ usage: { input_tokens: 500, output_tokens: 100, total_tokens: 600,
    input_tokens_details: { cached_tokens: 200 }, output_tokens_details: { reasoning_tokens: 50 } },
    output: [{ type: "web_search_call" }, { type: "message" }] }, "search", "test-model");
  assert.equal(entry?.total, 600); assert.equal(entry?.cachedInput, 200); assert.equal(entry?.webSearchCalls, 1);
  assert.equal(recordUsage({ output: [] }, "compare", "test-model"), null);
});
test("token reset headers and oversized requests are handled without futile retries", async () => {
  assert.equal(retryDelay({ headers: new Headers({ "x-ratelimit-reset-tokens": "1m2.5s" }) }, 0), 63500);
  const error = { status: 429, message: "Tokens per min (TPM): Limit 10000, Used 0, Requested 12000. secret" };
  assert.deepEqual(tokenLimitDetails(error), { limit: 10000, used: 0, requested: 12000 });
  let calls = 0;
  await assert.rejects(withRateLimitRetry(async () => { calls++; throw error; }, new AbortController().signal, () => {}, async () => assert.fail("must not retry")));
  assert.equal(calls, 1);
});
