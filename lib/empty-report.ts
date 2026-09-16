import { DEFAULT_CRITERIA, type Report } from "./schema";

// Internal empty state only: never rendered as an analysis or persisted.
export function emptyReport(): Report {
  return { id: "", createdAt: "", mode: "live", criteria: DEFAULT_CRITERIA,
    market: "판단 유보", headline: "", summary: "", summarySourceIds: [],
    news: [], regions: [], scan: [], candidates: [], tracking: [], pickId: null,
    pickAnalysis: [], conclusion: "", sources: [], limitations: [], changes: [], coverage: [] };
}
