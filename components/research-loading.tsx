"use client";
import { useEffect, useState } from "react";
import { Check, Clock3, LoaderCircle, Search, X } from "lucide-react";

export default function ResearchLoading({ messages, onCancel }: { messages: string[]; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const synthesizing = messages.some(m => m === "가격 비교 진행 중");
  return <section className="research-loading" aria-label="부동산 분석 진행 중" aria-busy="true">
    <div className="research-orbit"><Search size={31}/><LoaderCircle className="spin" size={75}/></div>
    <span className="eyebrow">RESEARCH IN PROGRESS</span>
    <h2>나에게 맞는 집을 찾고 있습니다</h2>
    <p>GPT가 최신 자료를 검색하고 서울·경기 후보를 비교합니다.<br/>자료 검색과 분석에 수 분이 걸릴 수 있습니다.</p>
    <div className="research-elapsed"><Clock3 size={14}/>{Math.floor(seconds / 60)}분 {String(seconds % 60).padStart(2, "0")}초 경과</div>
    <div className="research-steps">
      <div className={synthesizing ? "done" : ""}>{synthesizing ? <Check size={17}/> : <LoaderCircle size={17} className="spin"/>}<span>검색 중</span><small>{synthesizing ? "완료" : "진행 중"}</small></div>
      <div>{synthesizing ? <LoaderCircle size={17} className="spin"/> : <span className="step-dot"/>}<span>가격 비교 진행 중</span><small>{synthesizing ? "진행 중" : "대기"}</small></div>
    </div>
    <div className="research-current" role="status" aria-live="polite">{messages.at(-1)?.includes("재시도") ? "잠시 대기 후 자동으로 계속합니다." : synthesizing ? "확인한 매매 가격을 비교하고 있습니다." : "매매 가격과 출처를 확인하고 있습니다."}</div>
    {seconds >= 180 && <p className="research-patience">아직 분석 중입니다. 완료되면 결과가 자동으로 표시됩니다.</p>}
    <button className="secondary-button" onClick={onCancel}>분석 중단 <X size={14}/></button>
    <p className="research-footnote">이 화면을 열어 두세요. 완료된 브리핑은 보관함에 저장됩니다.</p>
  </section>;
}
