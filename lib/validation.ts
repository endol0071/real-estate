import { observedUrl } from "./evidence-identity";
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
  if (candidate.listings?.length) return candidate.listings.some(l => l.price >= criteria.minBudget && l.price <= criteria.maxBudget);
  // A confirmed asking range takes precedence over an older sale price.
  if (candidate.askingMin !== null && candidate.askingMax !== null) return candidate.askingMin <= criteria.maxBudget && candidate.askingMax >= criteria.minBudget;
  return !!latest && latest.value >= criteria.minBudget && latest.value <= criteria.maxBudget;
}
export function validateAnalysis(analysis: Analysis, criteria: Criteria, observedUrls: Set<string>, onRejected?: (reasons: string[]) => void, asOf?: string): Analysis {
  const sources = analysis.sources.filter(s => safeUrl(s.url) && observedUrl(s.url, observedUrls));
  const ids = new Set(sources.map(s => s.id));
  const keepRefs = (refs: string[]) => [...new Set(refs.filter(id => ids.has(id)))];
  // A stale secondary citation must not erase a price supported by a valid primary citation.
  analysis = { ...analysis, candidates: analysis.candidates.map(c => ({ ...c,
    sourceIds: keepRefs([...c.sourceIds, ...c.trades.flatMap(t => t.sourceIds), ...c.askingSourceIds, ...(c.listings ?? []).flatMap(l => l.sourceIds), ...(c.referencePrices ?? []).flatMap(r => r.sourceIds)]),
    askingSourceIds: keepRefs(c.askingSourceIds),
    trades: c.trades.map(t => ({ ...t, sourceIds: keepRefs(t.sourceIds) })),
    listings: c.listings?.map(l => ({ ...l, sourceIds: keepRefs(l.sourceIds) })),
    referencePrices: c.referencePrices?.map(r => ({ ...r, sourceIds: keepRefs(r.sourceIds) })),
    factors: c.factors.map(f => ({ ...f, sourceIds: keepRefs(f.sourceIds) })),
  })) };
  const valid = (refs: string[]) => refs.length > 0 && refs.every(id => ids.has(id));
  const today = asOf ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  function recent(date: string, days: number) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return false;
    const delta = new Date(`${today}T00:00:00Z`).getTime() - parsed.getTime();
    return delta >= 0 && delta <= days * 86_400_000;
  }
  const seen = new Set<string>();
  const cleanedCandidates = analysis.candidates.map(original => {
    const listings = original.listings?.filter(l => valid(l.sourceIds) && l.price > 0 && Math.abs(l.area - original.area) < 0.001 && recent(l.checkedAt, 14));
    const referencePrices = original.referencePrices?.filter(r => valid(r.sourceIds) && r.value > 0 && recent(r.date, 100));
    // New reports derive asking ranges exclusively from individual listings; old saved reports remain readable.
    const c = listings === undefined ? original : { ...original, listings, referencePrices,
      askingMin: listings.length ? Math.min(...listings.map(l => l.price)) : null,
      askingMax: listings.length ? Math.max(...listings.map(l => l.price)) : null,
      askingDate: listings.length ? [...listings].sort((a,b) => b.checkedAt.localeCompare(a.checkedAt))[0].checkedAt : null,
      askingSourceIds: [...new Set(listings.flatMap(l => l.sourceIds))],
    };
    const validAsking = valid(c.askingSourceIds) && c.askingDate && recent(c.askingDate, 14) && c.askingMin !== null && c.askingMax !== null && c.askingMin > 0 && c.askingMin <= c.askingMax;
    const reasons: string[] = [];
    if (!valid(c.sourceIds)) reasons.push("출처 연결 없음");
    if (c.trades.length && !c.trades.some(t => valid(t.sourceIds))) reasons.push("실거래 출처 연결 실패");
    if (c.trades.some(t => valid(t.sourceIds)) && !c.trades.some(t => valid(t.sourceIds) && recent(t.date, 100))) reasons.push("실거래 날짜 형식·기간 불충족");
    if (c.askingMin !== null && !valid(c.askingSourceIds)) reasons.push("호가 출처 연결 실패");
    if (c.askingMin !== null && valid(c.askingSourceIds) && (!c.askingDate || !recent(c.askingDate, 14))) reasons.push("호가 확인일 형식·기간 불충족");
    if (!c.trades.length && c.askingMin === null) reasons.push("응답에 가격 없음");
    const cleaned = { ...c,
      trades: c.trades.filter(t => valid(t.sourceIds) && t.value > 0 && recent(t.date, 100)).sort((a,b) => a.date.localeCompare(b.date)),
      askingMin: validAsking ? c.askingMin : null, askingMax: validAsking ? c.askingMax : null,
      askingDate: validAsking ? c.askingDate : null, askingSourceIds: validAsking ? c.askingSourceIds : [],
      referencePrices,
      status: c.askingMin === null && c.status === "매수검토" ? "가격대기" as const : c.status,
      factors: c.factors.filter(f => valid(f.sourceIds)),
    };
    if (isExcluded(c, criteria.excludedRegions)) reasons.push("제외지역");
    if (c.area < criteria.minArea) reasons.push("최소 면적 미달");
    if (c.status === "제외") reasons.push("모델 제외 판단");
    if (!eligible(cleaned, criteria) && (cleaned.trades.length || validAsking)) reasons.push("예산 또는 후보 조건 불충족");
    if ((!valid(cleaned.sourceIds) || !eligible(cleaned, criteria)) && onRejected) onRejected(reasons.length ? reasons : ["유효한 가격 없음"]);
    return cleaned;
  });
  const candidates = cleanedCandidates.filter(c => {
    const key = normalize(`${c.address}${c.name}${c.area}`);
    if (!valid(c.sourceIds) || !eligible(c, criteria) || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 10);
  const pick = candidates.find(c => c.id === analysis.pickId);
  const allowedClaim = (claim: { title: string; body: string; sourceIds: string[] }) => valid(claim.sourceIds) && !isExcluded({ region: claim.title, address: claim.body }, criteria.excludedRegions);
  const referenceCandidates = cleanedCandidates.filter(c => !c.trades.length && c.askingMin === null && c.status !== "제외" && c.area >= criteria.minArea && !isExcluded(c, criteria.excludedRegions) && c.referencePrices?.some(r => r.value >= criteria.minBudget && r.value <= criteria.maxBudget)).slice(0, 10);
  return { ...analysis, sources, candidates, referenceCandidates,
    market: valid(analysis.summarySourceIds) ? analysis.market : "판단 유보",
    headline: valid(analysis.summarySourceIds) ? analysis.headline : "확인 가능한 근거부터, 신중하게 비교합니다.",
    summary: valid(analysis.summarySourceIds) ? analysis.summary : "시장 방향을 판단하기에 출처가 충분하지 않습니다. 확인된 개별 자료와 검색 누락 범위를 아래에서 확인해 주세요.",
    news: analysis.news.filter(n => valid(n.sourceIds)),
    scan: analysis.scan.filter(allowedClaim), tracking: analysis.tracking.filter(allowedClaim),
    regions: analysis.regions.filter(r => !isExcluded({ region: r.name, address: "" }, criteria.excludedRegions)),
    pickId: pick?.id ?? null, pickAnalysis: pick ? analysis.pickAnalysis.filter(p => valid(p.sourceIds)) : [],
    conclusion: candidates.length ? candidates.map(c => `${c.name}: ${c.status}`).join(" · ") : "검증 가능한 신규 후보가 없습니다. 자료를 보강한 후 다시 비교해 주세요.",
    limitations: [...analysis.limitations, "공개 웹 검색 기반 분석이며 국토부 거래 원장이나 유료 호가 데이터의 전수 조회가 아닙니다.", "서버는 열람 출처 연결 및 날짜·조건을 검증합니다. 원문과 AI의 해석이 일치하는지 최종 확인이 필요합니다. 거래는 최근 100일, 호가는 최근 14일 이내 확인값만 후보 선별에 사용합니다.", ...(candidates.length < analysis.candidates.length ? ["예산·면적·제외지역·출처 검증을 통과하지 못한 후보를 제거했습니다."] : [])],
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
