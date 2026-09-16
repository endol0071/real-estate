import type { Candidate } from "./schema";
export function priceBasis(candidate: Candidate) {
  return candidate.askingMin !== null ? "개별 호가 확인" : candidate.trades.length ? "현재 호가 확인 필요" : "시세 참고 · 매물 확인 필요";
}
export function compareRecommendations(a: Candidate, b: Candidate) {
  const tier = (c: Candidate) => c.askingMin !== null ? 0 : c.trades.length ? 1 : 2;
  return tier(a) - tier(b) || (b.investmentScore + b.livingScore) - (a.investmentScore + a.livingScore);
}
