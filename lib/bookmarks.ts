import { z } from "zod";
import { CandidateSchema, SourceSchema, type Candidate, type Report } from "./schema";

export const BOOKMARK_STORAGE_KEY = "jipnote-bookmarks";
const BookmarkSchema = z.object({
  key: z.string(), candidate: CandidateSchema, mode: z.enum(["demo", "live"]),
  sources: z.array(SourceSchema), createdAt: z.string(), savedAt: z.string(),
});
export type SavedBookmark = z.infer<typeof BookmarkSchema>;
export const bookmarkKey = (candidate: Candidate, mode: Report["mode"]) => `${mode}:${candidate.address}:${candidate.name}:${candidate.area}`;

export function snapshot(candidate: Candidate, report: Report): SavedBookmark {
  return { key: bookmarkKey(candidate, report.mode), candidate, mode: report.mode, sources: report.sources,
    createdAt: report.createdAt, savedAt: new Date().toISOString() };
}

export function decodeBookmarks(raw: string | null, reports: Report[] = []): SavedBookmark[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  // Old versions saved only keys. Recover their snapshots from known reports.
  if (Array.isArray(data) && data.every(item => typeof item === "string")) {
    const found = new Map<string, SavedBookmark>();
    for (const report of reports) for (const candidate of report.candidates) {
      const key = bookmarkKey(candidate, report.mode);
      if (data.includes(key) && !found.has(key)) found.set(key, snapshot(candidate, report));
    }
    return [...found.values()];
  }
  const parsed = z.object({ version: z.literal(2), items: z.array(BookmarkSchema).max(100) }).parse(data);
  return [...new Map(parsed.items.map(item => [bookmarkKey(item.candidate, item.mode), { ...item, key: bookmarkKey(item.candidate, item.mode) }])).values()];
}

export function encodeBookmarks(items: SavedBookmark[]) {
  if (items.length > 100) throw new Error("관심단지는 최대 100개까지 저장할 수 있습니다. 기존 단지를 삭제한 후 다시 시도해 주세요.");
  return JSON.stringify({ version: 2, items });
}
