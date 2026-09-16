type ModelEnvironment = Record<string, string | undefined>;
export function researchModel(stage: "discover" | "prices", env: ModelEnvironment = process.env) {
  return stage === "discover"
    ? { model: env.OPENAI_DISCOVERY_MODEL?.trim() || "gpt-5.4-mini", effort: "low" as const }
    : { model: env.OPENAI_PRICE_MODEL?.trim() || env.OPENAI_MODEL?.trim() || "gpt-5.4-nano", effort: "none" as const };
}
