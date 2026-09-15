import type { Analysis, Candidate, Change, Criteria } from "./schema";

export function safeUrl(url: string) {
  try { const u = new URL(url); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
const normalize = (s: string) => s.replace(/서울특별시/g, "서울").replace(/경기도/g, "경기").replace(/[\s,·]/g, "");
export function isExcluded(candidate: Pick<Candidate, "region" | "address">, exclusions: string[]) {
  const region = normalize(`${candidate.region} ${candidate.address}`);
  return exclusions.some(exclusion => region.includes(normalize(exclusion)));
}
export function eligible(candidate: Candidate, criteria: Criteria) {
  if (isExcluded(candidate, criteria.excludedRegions) || candidate.area < criteria.minArea || candidate.status === "제외") return false;
  const latest = [...candidate.trades].sort((a, b) => b.date.localeCompare(a.date))[0];
  // A confirmed asking range takes precedence over an older sale price.
  if (candidate.askingMin !== null && candidate.askingMax !== null) return candidate.askingMin <= criteria.maxBudget && candidate.askingMax >= criteria.minBudget;
  return !!latest && latest.value >= criteria.minBudget && latest.value <= criteria.maxBudget;
}
export function validateAnalysis(analysis: Analysis, criteria: Criteria, observedUrls: Set<string>): Analysis {
  const sources = analysis.sources.filter(s => safeUrl(s.url) && observedUrls.has(s.url));
  const ids = new Set(sources.map(s => s.id));
  const valid = (refs: string[]) => refs.length > 0 && refs.every(id => ids.has(id));
  const candidates = analysis.candidates.map(c => {
    const validAsking = valid(c.askingSourceIds) && c.askingDate && /^\d{4}-\d{2}-\d{2}$/.test(c.askingDate) && c.askingMin !== null && c.askingMax !== null && c.askingMin > 0 && c.askingMin <= c.askingMax;
    return { ...c,
      trades: c.trades.filter(t => valid(t.sourceIds) && t.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date)).sort((a,b) => a.date.localeCompare(b.date)),
      askingMin: validAsking ? c.askingMin : null, askingMax: validAsking ? c.askingMax : null,
      askingDate: validAsking ? c.askingDate : null, askingSourceIds: validAsking ? c.askingSourceIds : [],
      factors: c.factors.filter(f => valid(f.sourceIds)),
    };
  }).filter(c => valid(c.sourceIds) && eligible(c, criteria)).slice(0, 10);
  const pick = candidates.find(c => c.id === analysis.pickId);
  return { ...analysis, sources, candidates,
    news: analysis.news.filter(n => valid(n.sourceIds)),
    regions: analysis.regions.filter(r => !isExcluded({ region: r.name, address: "" }, criteria.excludedRegions)),
    pickId: pick?.id ?? null, pickAnalysis: pick ? analysis.pickAnalysis.filter(p => valid(p.sourceIds)) : [],
    limitations: [...analysis.limitations, "공개 웹 검색 기반 분석이며 국토부 거래 원장이나 유료 호가 데이터의 전수 조회가 아닙니다.", ...(candidates.length < analysis.candidates.length ? ["예산·면적·제외지역·출처 검증을 통과하지 못한 후보를 제거했습니다."] : [])],
  };
}
export function priceChanges(candidates: Candidate[]): Change[] {
  return candidates.flatMap(c => {
    const trades = [...c.trades].sort((a,b) => a.date.localeCompare(b.date));
    const after = trades.at(-1); const before = trades.at(-2);
    if (!after || !before || after.date === before.date || before.value <= 0) return [];
    const percent = (after.value - before.value) / before.value * 100;
    if (Math.abs(percent) < 3 && Math.abs(after.value - before.value) < 0.5 - 1e-9) return [];
    return [{ name: c.name, area: c.area, before: before.value, after: after.value, percent: Math.round(percent * 10) / 10,
      basis: `전일 대비 아님 · 동일 전용면적의 직전 확인 거래 ${before.date} (${before.floor}) → ${after.date} (${after.floor}). 동·층·상태 차이로 단순 비교에 한계가 있습니다.`,
      sourceIds: [...new Set([...before.sourceIds, ...after.sourceIds])],
    }];
  });
}
