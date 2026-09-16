import { tokenLimitDetails, rateLimitKind } from "./api-retry";

export function researchErrorMessage(error: unknown, aborted: boolean): string {
  if (aborted) return "분석이 중단되었거나 제한 시간을 초과했습니다. 다시 시도해 주세요.";
  const e = error as { status?: number; code?: string; type?: string; rejected?: Record<string, number>; collection?: { discovered: number; linked: number; selected: number; returned: number; identityMatched: number; formatErrors: number; requestErrors: number } } | null;
  if (e?.code === "no_verified_prices") {
    const d = e.collection;
    const reason = !d ? "수집 단계별 내역이 없습니다." : d.formatErrors ? `응답 형식 오류 ${d.formatErrors}회가 발생했습니다.` : !d.discovered ? "검색 응답에서 단지 후보를 추출하지 못했습니다." : !d.linked ? "발견한 단지와 검색 출처를 연결하지 못했습니다." : !d.returned ? `후보 ${d.selected}개를 추가 검색했으나 가격 응답을 확보하지 못했습니다.` : !d.identityMatched ? `가격 후보 ${d.returned}개가 단지명·주소 비교에서 제외됐습니다.` : `가격 후보 ${d.identityMatched}개가 출처·날짜·예산·면적 조건을 통과하지 못했습니다.`;
    const allowed = ["출처 연결 없음", "실거래 출처 연결 실패", "실거래 날짜 형식·기간 불충족", "호가 출처 연결 실패", "호가 확인일 형식·기간 불충족", "응답에 가격 없음", "제외지역", "최소 면적 미달", "모델 제외 판단", "예산 또는 후보 조건 불충족", "유효한 가격 없음"];
    const details = Object.entries(e.rejected ?? {}).filter(([key, count]) => allowed.includes(key) && Number.isSafeInteger(count) && count > 0).map(([key, count]) => `${key} ${count}건`).join(" · ");
    return `${reason}${details ? ` [${details}]` : ""} 조건에 맞는 아파트가 없다는 뜻은 아닙니다. 이번 결과는 저장하지 않았습니다.`;
  }
  if (e?.code === "analysis_incomplete") return "응답이 출력 제한 등에 의해 완성되지 않았습니다. API 사용량을 확인해 주세요. 미완성 가격은 표시하지 않습니다.";
  if (e?.code === "credit_balance_exhausted") return "OpenAI API 크레딧 잔액이 소진되었습니다. OpenAI Billing에서 API 크레딧을 충전한 후 다시 분석해 주세요. ChatGPT 구독과 API 요금은 별도입니다.";
  if (e?.code === "insufficient_quota" || e?.type === "insufficient_quota") return "OpenAI API 크레딧이 부족하거나 사용 한도에 도달했습니다. OpenAI Billing에서 API 결제·크레딧과 사용 한도를 확인한 후 다시 분석해 주세요. ChatGPT 구독과 API 요금은 별도입니다.";
  if (e?.status === 429 && rateLimitKind(error) === "분당 토큰 처리량") {
    const { limit, used, requested } = tokenLimitDetails(error);
    const numbers = [limit !== undefined ? `한도 ${limit.toLocaleString()}` : "", used !== undefined ? `사용 ${used.toLocaleString()}` : "", requested !== undefined ? `요청 ${requested.toLocaleString()}` : ""].filter(Boolean).join(" / ");
    return `OpenAI 분당 토큰 처리량 제한입니다${numbers ? ` (${numbers})` : ""}. 크레딧 잔액과 별개입니다. ${limit && requested && requested > limit ? "한 요청이 한도를 초과하므로 프로젝트 Limits 조정 또는 요청 크기 축소가 필요합니다." : "자동 재시도 후에도 제한되어 중단했습니다. 잠시 후 다시 시도하거나 프로젝트 Limits를 확인해 주세요."}`;
  }
  if (e?.status === 429) return `OpenAI ${rateLimitKind(error)} 제한에 도달했습니다. 크레딧 잔액과 별개인 속도 제한입니다. 잠시 후 다시 시도하거나 프로젝트의 Limits를 확인해 주세요.`;
  if (e?.status === 401) return "서버의 OpenAI API 키가 유효하지 않습니다. 키 설정을 확인해 주세요.";
  if (e?.status === 403 || e?.code === "model_not_found") return "설정된 OpenAI 모델을 사용할 권한이 없습니다. OPENAI_MODEL과 프로젝트 권한을 확인해 주세요.";
  return "자료 검색 또는 리포트 저장에 실패했습니다. API 모델·권한·서버 저장 경로를 확인한 후 다시 시도해 주세요.";
}
