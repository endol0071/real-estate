import { test } from "node:test";
import assert from "node:assert/strict";
import { researchErrorMessage } from "../lib/research-error";

test("billing exhaustion is distinct from transient rate limits and never leaks raw errors", () => {
  assert.match(researchErrorMessage({ status: 429, code: "credit_balance_exhausted" }, false), /크레딧 잔액이 소진/);
  assert.match(researchErrorMessage({ status: 429, type: "insufficient_quota" }, false), /크레딧이 부족/);
  assert.match(researchErrorMessage({ status: 429 }, false), /잠시 후/);
  assert.doesNotMatch(researchErrorMessage(new Error("secret-api-key"), false), /secret-api-key/);
  assert.match(researchErrorMessage(null, true), /중단/);
});
