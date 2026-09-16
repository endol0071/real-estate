import { test } from "node:test";
import assert from "node:assert/strict";
import { researchModel } from "../lib/research-models";

test("discovery uses stronger reasoning while price extraction stays on nano", () => {
  assert.deepEqual(researchModel("discover", {}), { model: "gpt-5.4-mini", effort: "low" });
  assert.deepEqual(researchModel("prices", {}), { model: "gpt-5.4-nano", effort: "none" });
  assert.equal(researchModel("discover", { OPENAI_MODEL: "gpt-5.4-nano" }).model, "gpt-5.4-mini");
});
test("stage overrides and legacy price fallback resolve independently", () => {
  const env = { OPENAI_DISCOVERY_MODEL: "test-discovery", OPENAI_PRICE_MODEL: "test-price", OPENAI_MODEL: "test-legacy" };
  assert.equal(researchModel("discover", env).model, "test-discovery");
  assert.equal(researchModel("prices", env).model, "test-price");
  assert.equal(researchModel("prices", { OPENAI_MODEL: "test-legacy" }).model, "test-legacy");
});
