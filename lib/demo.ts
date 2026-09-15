import { DEFAULT_CRITERIA, type Candidate, type Criteria, type Report } from "./schema";
import { eligible, priceChanges } from "./validation";

const EXAMPLE_CANDIDATES: Candidate[] = [
  { id: "demo-1", name: "한강 리버포레 (가상)", province: "서울", region: "서울 동작구", address: "서울 동작구 상도동 · 가상 단지", area: 59.98, households: 1080, builtYear: 2018, askingMin: 10.4, askingMax: 11, askingDate: "2026-09-15", askingSourceIds: [], trades: [{ value: 9.7, date: "2026-07-03", floor: "8층", sourceIds: [] }, { value: 9.9, date: "2026-08-12", floor: "12층", sourceIds: [] }, { value: 10.2, date: "2026-09-05", floor: "10층", sourceIds: [] }], status: "매수검토", investmentScore: 87, livingScore: 89, summary: "도심 접근성과 생활 인프라의 균형을 비교하는 예시입니다.", tags: ["역세권", "대단지", "생활 인프라"], commute: "예시 화면에서는 실제 경로를 조회하지 않습니다.", factors: [], risks: ["가상의 단지이며 실제 거래·매물 정보가 아닙니다.", "취득세 등 부대비용은 매매 예산에 포함되지 않습니다."], sourceIds: [] },
  { id: "demo-2", name: "평촌 센트럴가든 (가상)", province: "경기", region: "경기 안양시 동안구", address: "경기 안양시 동안구 비산동 · 가상 단지", area: 84.92, households: 1240, builtYear: 2016, askingMin: 9.8, askingMax: 10.8, askingDate: "2026-09-15", askingSourceIds: [], trades: [{ value: 9.4, date: "2026-07-10", floor: "7층", sourceIds: [] }, { value: 9.5, date: "2026-08-03", floor: "9층", sourceIds: [] }, { value: 10, date: "2026-09-07", floor: "16층", sourceIds: [] }], status: "매수검토", investmentScore: 85, livingScore: 92, summary: "같은 예산에서 더 넓은 전용면적과 주거 환경을 비교하는 예시입니다.", tags: ["전용 84㎡", "대단지", "교육 환경"], commute: "실제 직장별 통근 경로는 실시간 분석에서 확인 필요", factors: [], risks: ["교통 호재의 확정 여부 및 일정은 별도 확인이 필요합니다."], sourceIds: [] },
  { id: "demo-3", name: "수지 그린힐스 (가상)", province: "경기", region: "경기 용인시 수지구", address: "경기 용인시 수지구 풍덕천동 · 가상 단지", area: 84.7, households: 860, builtYear: 2015, askingMin: 9.6, askingMax: 10.5, askingDate: "2026-09-15", askingSourceIds: [], trades: [{ value: 9.6, date: "2026-07-18", floor: "5층", sourceIds: [] }, { value: 9.8, date: "2026-08-09", floor: "9층", sourceIds: [] }, { value: 9.8, date: "2026-09-02", floor: "9층", sourceIds: [] }], status: "가격대기", investmentScore: 83, livingScore: 88, summary: "업무지구 수요와 매수 가격의 적절성을 함께 살펴보는 예시입니다.", tags: ["직주근접", "전용 84㎡"], commute: "실제 경로 미확인", factors: [], risks: ["주변 입주 물량과 전세수요를 함께 확인해야 합니다."], sourceIds: [] },
  { id: "demo-4", name: "광명 파크에비뉴 (가상)", province: "경기", region: "경기 광명시", address: "경기 광명시 철산동 · 가상 단지", area: 59.9, households: 1620, builtYear: 2021, askingMin: 10.5, askingMax: 11.4, askingDate: "2026-09-15", askingSourceIds: [], trades: [{ value: 9.9, date: "2026-07-14", floor: "10층", sourceIds: [] }, { value: 10.2, date: "2026-08-21", floor: "12층", sourceIds: [] }, { value: 10.6, date: "2026-09-03", floor: "15층", sourceIds: [] }], status: "가격대기", investmentScore: 82, livingScore: 86, summary: "신축 선호와 향후 공급 부담을 동시에 평가하는 예시입니다.", tags: ["준신축", "대단지"], commute: "실제 경로 미확인", factors: [], risks: ["일부 예시 호가는 설정 예산을 초과합니다."], sourceIds: [] },
  { id: "demo-5", name: "고덕 어반포레 (가상)", province: "서울", region: "서울 강동구", address: "서울 강동구 고덕동 · 가상 단지", area: 59.8, households: 940, builtYear: 2019, askingMin: 10.8, askingMax: 11.6, askingDate: "2026-09-15", askingSourceIds: [], trades: [{ value: 9.9, date: "2026-07-11", floor: "5층", sourceIds: [] }, { value: 10.1, date: "2026-08-01", floor: "8층", sourceIds: [] }, { value: 10.8, date: "2026-09-06", floor: "19층", sourceIds: [] }], status: "과열", investmentScore: 78, livingScore: 90, summary: "최근 거래 상승이 층 차이인지 추세인지 구분하는 예시입니다.", tags: ["주거 환경", "가격 점검"], commute: "실제 경로 미확인", factors: [], risks: ["직전 거래와 층수가 달라 상승률을 추세로 볼 수 없습니다."], sourceIds: [] },
  { id: "demo-6", name: "영통 레이크테라스 (가상)", province: "경기", region: "경기 수원시 영통구", address: "경기 수원시 영통구 이의동 · 가상 단지", area: 84.9, households: 720, builtYear: 2017, askingMin: 9.5, askingMax: 10.6, askingDate: "2026-09-15", askingSourceIds: [], trades: [{ value: 9.3, date: "2026-07-05", floor: "5층", sourceIds: [] }, { value: 9.5, date: "2026-08-11", floor: "8층", sourceIds: [] }, { value: 9.7, date: "2026-09-01", floor: "11층", sourceIds: [] }], status: "매수검토", investmentScore: 81, livingScore: 91, summary: "생활 환경과 지역 내 갈아타기 수요를 비교하는 예시입니다.", tags: ["전용 84㎡", "생활 환경"], commute: "실제 경로 미확인", factors: [], risks: ["가상 수치이며 실제 단지 가격과 무관합니다."], sourceIds: [] },
];

export function createDemo(criteria: Criteria = DEFAULT_CRITERIA): Report {
  const candidates = EXAMPLE_CANDIDATES.filter(c => eligible(c, criteria)).map(c => ({ ...c, factors: [
    { title: "입지와 업무지구 접근성", body: "입력한 직장과 핵심 업무지구 접근성을 함께 평가합니다. 이 화면은 가상 데이터로 경로 조회 결과가 아닙니다.", sourceIds: [] },
    { title: "교통 개선과 정비사업", body: "실시간 분석 시 사업 단계, 확정도, 개통 예정 시점을 공식 자료에서 확인합니다.", sourceIds: [] },
    { title: "수요와 향후 공급", body: "향후 2~3년 입주 물량, 전세 수요, 생활 인프라와 상급지 가격 차이를 함께 비교합니다.", sourceIds: [] },
  ] }));
  return {
    id: "demo", createdAt: "2026-09-15T00:00:00.000Z", mode: "demo", criteria,
    market: "판단 유보", headline: "좋은 집의 기준, 가격 그 너머까지.", summary: "서울과 경기를 같은 기준으로 비교합니다. 예산 안의 선택지를 넓게 살피고, 살아갈 가치와 보유할 가치를 함께 읽어보세요. 아래 단지와 가격은 기능 체험을 위한 가상 데이터입니다.", summarySourceIds: [],
    news: [
      { title: "대출·세금 정책", body: "매수 여력에 영향을 주는 정책 변화와 적용 시점을 공식 발표에서 확인합니다. 현재 화면은 뉴스 형식 예시입니다.", sourceIds: [] },
      { title: "교통 개선의 실제 진행 단계", body: "철도 계획, 착공, 개통을 구분하고 가격에 이미 반영된 기대를 살펴봅니다. 현재 소식이 아닙니다.", sourceIds: [] },
      { title: "향후 2~3년 공급 점검", body: "입주 물량과 전세 수요를 함께 살펴 하방 안정성을 비교합니다. 현재 공급 통계가 아닙니다.", sourceIds: [] },
    ],
    regions: ["서울 남서권", "서울 동남권", "서울 중부권", "성남·판교", "안양·의왕", "수원·용인", "광명·부천", "하남·화성"].map(name => ({ name, investment: "예시", living: "예시", momentum: "미확인" as const, note: "실시간 분석 후 출처와 함께 표시", sourceIds: [] })),
    scan: [{ title: "넓게 살피고, 같은 기준으로 비교", body: "실시간 분석은 서울 전 권역, 경기 남부·동남부, 경기 서부·기타 권역을 새로 검색합니다. 제외지역은 선택사항이며 기본 제외지역은 없습니다.", sourceIds: [] }],
    candidates, changes: priceChanges(candidates),
    tracking: [{ title: "첫 번째 비교 기준을 만들어 보세요", body: "실시간 리포트가 저장되면 다음 동일 조건 분석에서 기존 후보와 비교합니다. 데모 데이터는 실제 분석 이력으로 사용하지 않습니다.", sourceIds: [] }],
    pickId: candidates[0]?.id ?? null,
    pickAnalysis: candidates[0]?.factors ?? [],
    conclusion: candidates.length ? "체험용 판단입니다. 실제 매수 후보는 최신 근거를 확인하는 실시간 분석에서 확인해 주세요." : "조건에 맞는 데모 후보가 없습니다. 실시간 분석으로 새 후보를 검색해 보세요.",
    sources: [], limitations: ["데모에 표시된 단지명·가격·세대수·연식·점수는 모두 가상입니다.", "데모는 예산·면적·제외지역 필터만 반영합니다. 직장 위치는 실제 검색에서 반영됩니다."],
    coverage: [{ name: "서울 전 권역", status: "완료", note: "데모 · 실제 검색 안 함" }, { name: "경기 주요 권역", status: "완료", note: "데모 · 실제 검색 안 함" }],
  };
}
