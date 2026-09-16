import { emptyReport } from "../../lib/empty-report";
import type { Candidate } from "../../lib/schema";

// User-supplied prose, NOT verified market data. Test-only; never imported by the app.
// Missing contract dates/floors remain unknown. The prose rounds some areas.
export const briefingClaims = [
  { name: "신도림롯데", region: "서울 구로구", area: 60, value: 11, date: "2026-07-25", url: "https://apt.mustarddata.com/apt/신도림롯데아파트/", caveat: "본문 60㎡, 제목 59㎡: 정확한 전용면적 원문 확인 필요" },
  { name: "관악 현대", region: "서울 관악구", area: 58.59, value: 10, date: "2026-08-05", url: "https://www.aptdamoa.com/real-price/7104/contents.html", caveat: "제목은 59㎡지만 본문은 58.59㎡" },
  { name: "금천롯데캐슬골드파크3차", region: "서울 금천구", area: 59.96, value: 11.2, date: "2026-08-29", url: "https://xn--9z2b11sikh7te8l.com/daily/20260910.html", caveat: "11억 이하 호가 미확인" },
  { name: "금정역호계푸르지오", region: "경기 안양", area: 85, value: 8.5, date: "", url: "https://dapt.kr/update/B3_20260908.html", caveat: "정확한 전용면적·계약일 없음; 페이지 날짜는 계약일 아님" },
  { name: "e편한세상금빛그랑메종3단지", region: "경기 성남 중원", area: 59.9, value: 11.55, date: "", url: "https://xn--9z2b11sikh7te8l.com/daily/20260910.html", caveat: "계약일 없음; 11억 급매 미확인" },
];
export function userBriefingFixture() {
  return { ...emptyReport(), sources: briefingClaims.map((c, i) => ({ id: `claim${i}`, name: "사용자 제공 답변의 링크 (미검증)", url: c.url, kind: "사용자 제공 실거래 주장", checkedAt: "2026-09-15" })),
    candidates: briefingClaims.map((c, i): Candidate => ({ id: `claim${i}`, name: c.name, address: c.region, region: c.region,
      province: c.region.startsWith("서울") ? "서울" : "경기", area: c.area, households: null, builtYear: null,
      askingMin: null, askingMax: null, askingDate: null, askingSourceIds: [],
      trades: [{ value: c.value, date: c.date, floor: "미확인", sourceIds: [`claim${i}`] }],
      status: "가격대기", investmentScore: 0, livingScore: 0, summary: c.caveat, tags: [], commute: "미확인", factors: [], risks: ["회귀 테스트 전용 · 실제 가격 검증 아님"], sourceIds: [`claim${i}`],
    })),
  };
}
