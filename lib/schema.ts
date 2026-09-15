import { z } from "zod";

export const CriteriaSchema = z.object({
  minBudget: z.number().min(0.5).max(200),
  maxBudget: z.number().min(0.5).max(200),
  workplaces: z.array(z.string().trim().min(2).max(80)).min(1).max(3),
  excludedRegions: z.array(z.string().trim().min(2).max(40)).max(30).default([]),
  minArea: z.number().min(20).max(300).default(59),
  commuteMinutes: z.number().int().min(15).max(180).default(60),
}).refine(v => v.minBudget <= v.maxBudget, { message: "최소 예산은 최대 예산보다 클 수 없습니다.", path: ["maxBudget"] });
export type Criteria = z.infer<typeof CriteriaSchema>;
export const DEFAULT_CRITERIA: Criteria = { minBudget: 9, maxBudget: 11, workplaces: ["판교역", "서울대입구역"], excludedRegions: [], minArea: 59, commuteMinutes: 60 };

const refs = z.array(z.string());
export const ClaimSchema = z.object({ title: z.string(), body: z.string(), sourceIds: refs });
export const SourceSchema = z.object({ id: z.string(), name: z.string(), url: z.string(), kind: z.string(), checkedAt: z.string() });
export const PriceSchema = z.object({ value: z.number(), date: z.string(), floor: z.string(), sourceIds: refs });
export const CandidateSchema = z.object({
  id: z.string(), name: z.string(), region: z.string(), address: z.string(), province: z.enum(["서울", "경기"]),
  area: z.number(), households: z.number().nullable(), builtYear: z.number().nullable(),
  askingMin: z.number().nullable(), askingMax: z.number().nullable(), askingDate: z.string().nullable(), askingSourceIds: refs,
  trades: z.array(PriceSchema), status: z.enum(["매수검토", "가격대기", "과열", "제외"]),
  investmentScore: z.number().min(0).max(100), livingScore: z.number().min(0).max(100),
  summary: z.string(), tags: z.array(z.string()), commute: z.string(),
  factors: z.array(ClaimSchema), risks: z.array(z.string()), sourceIds: refs,
});
export const AnalysisSchema = z.object({
  market: z.enum(["상승", "조정", "순환매", "판단 유보"]), headline: z.string(), summary: z.string(), summarySourceIds: refs,
  news: z.array(ClaimSchema),
  regions: z.array(z.object({ name: z.string(), investment: z.string(), living: z.string(), momentum: z.enum(["상승", "보합", "조정", "미확인"]), note: z.string(), sourceIds: refs })),
  scan: z.array(ClaimSchema), candidates: z.array(CandidateSchema),
  tracking: z.array(ClaimSchema), pickId: z.string().nullable(), pickAnalysis: z.array(ClaimSchema), conclusion: z.string(),
  sources: z.array(SourceSchema), limitations: z.array(z.string()),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Change = { name: string; area: number; before: number; after: number; percent: number; basis: string; sourceIds: string[] };
export type Report = Analysis & {
  id: string; createdAt: string; mode: "demo" | "live"; criteria: Criteria;
  changes: Change[]; coverage: { name: string; status: "완료" | "실패"; note: string }[];
};
export const ReportSchema = AnalysisSchema.extend({
  id: z.string(), createdAt: z.string(), mode: z.enum(["demo", "live"]), criteria: CriteriaSchema,
  changes: z.array(z.object({ name: z.string(), area: z.number(), before: z.number(), after: z.number(), percent: z.number(), basis: z.string(), sourceIds: refs })),
  coverage: z.array(z.object({ name: z.string(), status: z.enum(["완료", "실패"]), note: z.string() })),
});
