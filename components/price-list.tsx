"use client";
import { ArrowUpRight, Bookmark } from "lucide-react";
import type { Candidate, Report } from "@/lib/schema";
import { priceBasis } from "@/lib/price-basis";
import { Badge, SourceLinks } from "./primitives";

const money = (value: number | null) => value === null ? "미확인" : `${Number(value.toFixed(2))}억`;

export default function PriceList({ candidates, contextFor, onDetail, onBookmark, isBookmarked }: {
  candidates: Candidate[]; contextFor: (c: Candidate) => Report;
  onDetail: (c: Candidate) => void; onBookmark: (c: Candidate) => void;
  isBookmarked: (c: Candidate) => boolean;
}) {
  return <div className="price-list"><table aria-label="아파트 매매 가격 비교표"><thead><tr>
    <th>단지명 / 위치</th><th>전용면적</th><th>최근 실거래가</th><th>현재 매매 호가</th><th>판단</th><th>관심</th>
  </tr></thead><tbody>{candidates.map(c => {
    const latest = [...c.trades].sort((a,b) => b.date.localeCompare(a.date))[0];
    const context = contextFor(c);
    return <tr key={`${context.mode}:${c.address}:${c.name}:${c.area}`}>
      <td className="price-name"><button className="table-name" onClick={() => onDetail(c)}>{c.name}<ArrowUpRight size={16}/></button><span className="table-secondary">{c.region}</span><span className="table-secondary">{priceBasis(c)}</span><span className="table-secondary">{c.builtYear ? `${c.builtYear}년 준공` : "연식 미확인"}{c.households ? ` · ${c.households.toLocaleString()}세대` : ""}</span>{context.mode === "demo" && <span className="table-secondary">이전에 저장한 가상 데이터</span>}</td>
      <td className="price-area" data-label="전용면적">{c.area}㎡</td>
      <td className="price-sale" data-label="최근 실거래가"><strong>{money(latest?.value ?? null)}</strong><span className="table-secondary">{latest ? `${latest.date} · ${latest.floor}` : "확인된 거래 없음"}</span><SourceLinks ids={latest?.sourceIds ?? []} report={context}/></td>
      <td className="price-asking" data-label="현재 매매 호가"><strong>{c.askingMin === null ? "미확인" : `${money(c.askingMin)} ~ ${money(c.askingMax)}`}</strong><span className="table-secondary">{c.askingDate ? `${c.askingDate} 확인` : "현재 매물 확인 필요"}</span><SourceLinks ids={c.askingSourceIds} report={context}/>{c.askingMin !== null && latest && <span className="table-secondary">최근 거래 대비 호가 하단 {c.askingMin - latest.value >= 0 ? "+" : ""}{(c.askingMin - latest.value).toFixed(2)}억 · 동·층 차이 가능</span>}{c.referencePrices?.map((r,i) => <span className="table-secondary" key={i}>{r.kind} {money(r.value)} · {r.date} · {r.area === null ? "대상 면적 미확인" : `${r.area}㎡`} (참고)<SourceLinks ids={r.sourceIds} report={context}/></span>)}</td>
      <td className="price-status"><Badge status={c.status}/></td>
      <td className="price-bookmark"><button className={`icon-button bookmark ${isBookmarked(c) ? "is-saved" : ""}`} onClick={() => onBookmark(c)} aria-label={`${c.name} 관심단지 ${isBookmarked(c) ? "해제" : "저장"}`}><Bookmark size={19}/></button></td>
    </tr>;
  })}</tbody></table></div>;
}
