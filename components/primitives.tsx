"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, ExternalLink } from "lucide-react";
import type { Candidate, Report } from "@/lib/schema";
import { safeUrl } from "@/lib/validation";

export function SourceLinks({ ids, report }: { ids: string[]; report: Report }) {
  const sources = report.sources.filter(s => ids.includes(s.id) && safeUrl(s.url));
  return sources.length ? <span className="inline-sources">{sources.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.name}<ExternalLink size={10} /></a>)}</span> : null;
}
export function Badge({ status }: { status: Candidate["status"] }) { return <span className={`badge status-${status}`}>{status === "매수검토" && <span className="tiny-dot" />}{status}</span>; }
export function Sparkline({ values, large = false }: { values: number[]; large?: boolean }) {
  if (values.length < 2) return <span className="muted small">비교 자료 부족</span>;
  const min = Math.min(...values) - 0.1, max = Math.max(...values) + 0.1;
  const points = values.map((v,i) => `${5 + i / (values.length-1) * 130},${50 - (v-min)/(max-min)*40}`).join(" ");
  return <svg className={large ? "sparkline large" : "sparkline"} viewBox="0 0 140 60" role="img" aria-label={`확인 거래 순서: ${values.join(", ")}억원. 시간 간격은 동일하지 않음`}><path d={`M ${points.replaceAll(" ", " L ")} L 135 59 L 5 59 Z`} fill="var(--green-soft)"/><polyline points={points} fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{values.map((v,i) => <circle key={i} cx={5 + i/(values.length-1)*130} cy={50-(v-min)/(max-min)*40} r="2.8" fill="var(--green)"/>)}</svg>;
}
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { dialog?.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog className={`dialog ${wide ? "dialog-wide" : ""}`} ref={ref} onCancel={onClose} onClick={e => { if(e.target === e.currentTarget) onClose(); }} aria-labelledby="dialog-title"><div className="dialog-inner"><div className="dialog-head"><div><span className="eyebrow">JIPNOTE RESEARCH</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={22}/></button></div>{children}</div></dialog>;
}
