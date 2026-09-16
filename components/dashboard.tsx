"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Bookmark, Building2, Check, ChevronDown, ChevronRight, CircleHelp, Compass, FileText, History, House, Info, LayoutDashboard, LoaderCircle, MapPin, Menu, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, TrainFront, Wallet, X } from "lucide-react";
import Link from "next/link";
import { UsageSchema, type ApiUsage, CriteriaSchema, ReportSchema, type Candidate, type Criteria, type Report } from "@/lib/schema";
import { emptyReport } from "@/lib/empty-report";
import ResearchLoading from "./research-loading";
import PriceList from "./price-list";
import { compareRecommendations, priceBasis } from "@/lib/price-basis";
import { BOOKMARK_STORAGE_KEY, bookmarkKey as storedKey, decodeBookmarks, encodeBookmarks, snapshot, type SavedBookmark } from "@/lib/bookmarks";
import { safeUrl } from "@/lib/validation";
import { Badge, Dialog, SourceLinks, Sparkline } from "./primitives";

type View = "overview" | "candidates" | "saved" | "history" | "method";
type Tab = "all" | "서울" | "경기";
const menus = [{ id: "overview" as const, label: "매매 가격 비교", icon: LayoutDashboard }, { id: "candidates" as const, label: "추천 아파트", icon: Building2 }, { id: "saved" as const, label: "관심단지", icon: Bookmark }, { id: "history" as const, label: "브리핑 보관함", icon: History }];
const money = (n: number | null) => n === null ? "미확인" : `${Number(n.toFixed(2))}억`;
const displayDate = (date: string) => new Date(date).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" });

export default function Dashboard() {
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [report, setReport] = useState<Report>(emptyReport);
  const [view, setView] = useState<View>("overview");
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([]);
  const [saved, setSaved] = useState<Report[]>([]);
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [detailContext, setDetailContext] = useState<Report | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<ApiUsage[]>([]);
  const [progress, setProgress] = useState<string[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const displayedUsage = usage.length ? usage : busy || error ? [] : report.usage ?? [];

  useEffect(() => {
    // Hydrate external browser storage after SSR; it is unavailable on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setBookmarks(decodeBookmarks(localStorage.getItem(BOOKMARK_STORAGE_KEY), [])); } catch { setError("관심단지를 불러오지 못했습니다. 브라우저 저장소를 확인해 주세요."); }
    const syncBookmarks = (event: StorageEvent) => {
      if (event.key !== BOOKMARK_STORAGE_KEY && event.key !== null) return;
      try { setBookmarks(decodeBookmarks(localStorage.getItem(BOOKMARK_STORAGE_KEY), [])); } catch { setError("다른 탭의 관심단지를 불러오지 못했습니다."); }
    };
    window.addEventListener("storage", syncBookmarks);
    fetch("/api/config").then(r => r.json()).then(config => {
      setLiveAvailable(config.liveAvailable);
      return fetch("/api/reports").then(async r => { if (!r.ok) return; const data = await r.json(); const parsed = ReportSchema.array().safeParse(data.reports); if (parsed.success) { setSaved(parsed.data.filter(r => r.mode === "live")); try { setBookmarks(decodeBookmarks(localStorage.getItem(BOOKMARK_STORAGE_KEY), parsed.data)); } catch { setError("관심단지 데이터를 확인해 주세요."); } const latest = parsed.data.find(r => r.mode === "live"); if (latest) { setReport(latest); setCriteria(latest.criteria); } } }).catch(() => setError("저장된 브리핑을 불러오지 못했습니다."));
    }).catch(() => setError("서버에 연결하지 못했습니다. 연결을 확인한 뒤 새로고침해 주세요.")).finally(() => setInitializing(false));
    return () => { abortRef.current?.abort(); window.removeEventListener("storage", syncBookmarks); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);

  function contextFor(c: Candidate): Report {
    const entry = view === "saved" ? bookmarks.find(b => b.candidate === c) : undefined;
    return entry ? { ...report, mode: entry.mode, sources: entry.sources, createdAt: entry.createdAt } : report;
  }
  const isBookmarked = (c: Candidate, context = contextFor(c)) => bookmarks.some(b => b.key === storedKey(c, context.mode));
  function openDetail(c: Candidate) { setDetailContext(contextFor(c)); setDetail(c); }
  function toggleBookmark(c: Candidate, context = contextFor(c)) {
    try {
      // Re-read before each mutation so another tab's saved items are preserved.
      const current = decodeBookmarks(localStorage.getItem(BOOKMARK_STORAGE_KEY), [report, ...saved]);
      const key = storedKey(c, context.mode);
      const removing = current.some(b => b.key === key);
      const next = removing ? current.filter(b => b.key !== key) : [snapshot(c, context), ...current];
      localStorage.setItem(BOOKMARK_STORAGE_KEY, encodeBookmarks(next));
      setBookmarks(next);
      setToast(removing ? "관심단지에서 삭제했습니다." : "이 브라우저에 관심단지를 저장했습니다.");
    } catch { setError("관심단지 저장·삭제에 실패했습니다. 브라우저 저장 공간 또는 최대 100개 제한을 확인해 주세요."); }
  }
  async function loadHistory() {
    try { const response = await fetch("/api/reports"); const data = await response.json(); if (!response.ok) throw new Error(data.error); setSaved(ReportSchema.array().parse(data.reports).filter(r => r.mode === "live")); setToast("브리핑 보관함을 불러왔습니다."); }
    catch (e) { setError(e instanceof Error ? e.message : "이력을 불러오지 못했습니다."); }
  }
  async function run(next: Criteria) {
    if (abortRef.current || initializing) return;
    setCriteria(next); setEditing(false); setError(""); setView("overview"); setTab("all"); setQuery("");
    setBusy(true); setUsage([]); setProgress(["최신 자료 검색을 준비합니다."]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next), signal: controller.signal });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "분석을 시작하지 못했습니다."); }
      if (!response.body) throw new Error("서버 응답을 읽을 수 없습니다.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let completed = false;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n"); buffer = events.pop() || "";
        for (const event of events) {
          const type = event.split("\n").find(l => l.startsWith("event: "))?.slice(7);
          const raw = event.split("\n").find(l => l.startsWith("data: "))?.slice(6); if (!raw) continue;
          const data = JSON.parse(raw);
          if (type === "progress") setProgress(messages => [...messages, data.message]);
          if (type === "usage") setUsage(items => [...items, UsageSchema.parse(data)]);
          if (type === "error") throw new Error(data.message);
          if (type === "result") { const result = ReportSchema.parse(data); setReport(result); setSaved(s => [result, ...s.filter(r => r.id !== result.id)].slice(0,30)); completed = true; setToast("새 브리핑을 저장했습니다."); }
        }
      }
      if (!completed) throw new Error("연결이 종료되었습니다. 보관함을 확인하거나 다시 시도해 주세요.");
    } catch(e) {
      if (controller.signal.aborted) setToast("분석을 중단했습니다."); else setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    } finally { setBusy(false); abortRef.current = null; }
  }
  function download() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `집노트-${report.mode}-${report.createdAt.slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast("리포트를 JSON으로 내보냈습니다.");
  }
  const displayed = (view === "saved" ? bookmarks.map(b => b.candidate) : report.candidates).filter(c => (tab === "all" || c.province === tab) && `${c.name}${c.region}`.includes(query)).sort((a,b) => sort === "recommended" ? compareRecommendations(a,b) : sort === "living" ? b.livingScore-a.livingScore : sort === "price" ? (a.trades.at(-1)?.value ?? Infinity)-(b.trades.at(-1)?.value ?? Infinity) : sort === "asking" ? (a.askingMin ?? Infinity)-(b.askingMin ?? Infinity) : b.investmentScore-a.investmentScore);
  const hasReport = Boolean(report.id);
  const shownCriteria = busy || !hasReport ? criteria : report.criteria;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
      <Link className="brand" href="/" aria-label="집노트 홈"><span className="brand-icon"><House size={23} strokeWidth={1.8}/></span><span>집노트<span className="brand-en">JIPNOTE</span></span></Link>
      <div className="workspace-label">MY HOME, NEXT CHAPTER</div>
      <nav aria-label="메인 메뉴">{menus.map(item => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => { setView(item.id); setMobileNav(false); }}><item.icon size={19}/>{item.label}{item.id === "saved" && <span className="nav-count">{bookmarks.length}</span>}{item.id === "overview" && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-divider"/>
      <button className={`nav-item ${view === "method" ? "active" : ""}`} onClick={() => { setView("method"); setMobileNav(false); }}><Compass size={19}/>분석 기준 안내</button>
      <div className="sidebar-note"><span className="note-icon"><Sparkles size={20}/></span><strong>살기 좋은 집,<br/>가치 있는 선택.</strong><p>수많은 정보 사이에서<br/>나에게 맞는 집을 찾는 기준.</p><button onClick={() => setEditing(true)}>내 조건 설정하기 <ArrowUpRight size={15}/></button></div>
      <div className="sidebar-bottom"><span className="avatar">나</span><div><strong>나의 부동산 리서치</strong><span>개인 워크스페이스</span></div><button className="icon-button" aria-label="검색 조건 설정" onClick={() => setEditing(true)}><Settings2 size={17}/></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="메뉴 열기" onClick={() => setMobileNav(!mobileNav)}><Menu size={22}/></button><House size={15}/><ChevronRight size={13}/><span>{view === "method" ? "분석 기준 안내" : menus.find(m => m.id === view)?.label}</span></div><div className="topbar-right"><span className="live-label"><span/> 서울·경기 리서치</span><button onClick={() => setView("method")} className="icon-button" aria-label="도움말"><CircleHelp size={19}/></button><span className="avatar small-avatar">나</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">APARTMENT SALE PRICES</div><h1>{view === "overview" ? "아파트 매매 가격 비교" : view === "candidates" ? "나의 조건에 맞는 아파트" : view === "saved" ? "관심단지 모아보기" : view === "history" ? "쌓일수록 선명해지는 선택" : "우리는 이렇게 비교합니다"}</h1><p>{view === "history" ? "지난 분석을 다시 살펴보고, 판단의 변화를 확인하세요." : "단지별 실거래가와 현재 매매 호가를 한눈에 비교하세요."}</p></div><button className="secondary-button export" onClick={download} disabled={!hasReport || busy}><ArrowDownToLine size={16}/>리포트 내보내기</button></div>

        {error && <div className="error-banner" role="alert"><Info size={19}/><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="오류 닫기"><X size={17}/></button></div>}
        {shownCriteria && <section className="criteria-bar" aria-label="현재 검색 조건"><div className="criteria-item"><Wallet size={19}/><div><span>매매 예산</span><strong>{shownCriteria.minBudget}억 ~ {shownCriteria.maxBudget}억</strong></div></div><div className="criteria-item"><MapPin size={19}/><div><span>직장 · 주요 목적지</span><strong>{shownCriteria.workplaces.join(" · ")}</strong></div></div><div className="criteria-item"><Building2 size={19}/><div><span>주거 조건</span><strong>아파트 · 전용 {shownCriteria.minArea}㎡ 이상</strong></div></div><div className="criteria-item optional"><SlidersHorizontal size={18}/><div><span>제외지역</span><strong>{shownCriteria.excludedRegions.length ? `${shownCriteria.excludedRegions.length}개 지역` : "설정 없음"}</strong></div></div><button className="text-button" onClick={() => setEditing(true)} disabled={busy}>조건 변경 <ChevronRight size={15}/></button></section>}

        {(displayedUsage.length > 0) && <details className="panel"><summary>API 사용량 확인</summary>{displayedUsage.map((u, i) => <p key={i}>{u.phase === "search" ? "검색" : "가격 비교"} · {u.model} · 입력 {u.input.toLocaleString()} / 출력 {u.output.toLocaleString()} / 합계 {u.total.toLocaleString()} 토큰 (출력 중 추론 {u.reasoning.toLocaleString()}) · 웹 검색 {u.webSearchCalls}회</p>)}<small>응답이 끝난 요청의 사용량입니다. 진행·실패·취소된 요청은 사용량을 받지 못할 수 있으며, 검색 도구 요금은 별도입니다.</small></details>}
        {busy && <ResearchLoading messages={progress} onCancel={() => abortRef.current?.abort()}/>}
        {!busy && initializing && <div className="initial-loading" role="status"><LoaderCircle className="spin" size={24}/>저장된 분석과 서버 연결을 확인하고 있습니다.</div>}
        {!busy && !initializing && !hasReport && (view === "overview" || view === "candidates") && <section className="research-welcome"><span className="welcome-icon"><Search size={30}/></span><span className="eyebrow">YOUR PERSONAL PROPERTY RESEARCH</span><h2>최신 자료로 나의 다음 집을 찾아보세요</h2><p>예산과 직장에 맞춰 GPT가 서울·경기 아파트를 검색합니다.<br/>실거래·호가·투자 관점을 비교하고 결과에 정보 출처를 함께 표시합니다.</p><div className="welcome-points"><span><Check size={15}/>실거래와 호가 비교</span><span><Check size={15}/>서울·경기 통합 분석</span><span><Check size={15}/>출처 링크 제공</span></div><button className="primary-button" disabled={!liveAvailable} onClick={() => criteria ? run(criteria) : setEditing(true)}><Sparkles size={17}/>{criteria ? "현재 조건으로 분석 시작" : "조건 입력하고 분석 시작"}<ArrowRight size={17}/></button><button className="text-button" onClick={() => setEditing(true)}>예산·직장 조건 변경 <ChevronRight size={15}/></button>{!liveAvailable && <p className="form-error">서버에 API 키를 설정한 후 다시 접속해 주세요.</p>}<p className="welcome-note">분석에는 수 분이 걸릴 수 있습니다. 완료되면 결과가 자동으로 표시됩니다.</p></section>}
        {!busy && hasReport && <div className="mode-strip"><span><Info size={14}/>웹 검색 기반 · {displayDate(report.createdAt)} 확인 · AI 분석·신고 지연 등으로 실제 가격과 다를 수 있습니다. 출처를 확인해 주세요.</span><button disabled={initializing || !liveAvailable} onClick={() => criteria ? run(criteria) : setEditing(true)}>최신 자료로 분석<ArrowUpRight size={14}/></button></div>}

        {!busy && (((view === "overview" || view === "candidates") && hasReport) || view === "saved") && <section className="panel table-panel price-panel">
          <div className="section-heading"><h2>{view === "saved" ? "저장한 단지" : "매매 가격 비교"} <span className="heading-count">{displayed.length}</span></h2><span className="subtle-label">단지명을 누르면 거래 내역을 볼 수 있습니다.</span></div>
          <div className="list-toolbar"><div className="tabs">{(["all", "서울", "경기"] as const).map(t => <button key={t} className={tab === t ? "selected" : ""} onClick={() => setTab(t)}>{t === "all" ? "수도권 전체" : t}</button>)}</div><div className="list-filters"><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="단지명 또는 지역 검색" aria-label="단지명 또는 지역 검색"/></label><select aria-label="정렬 기준" value={sort} onChange={e => setSort(e.target.value)}><option value="recommended">호가 확인 우선</option><option value="price">실거래가 낮은 순</option><option value="asking">호가 낮은 순</option><option value="score">추천순</option><option value="living">실거주성 높은 순</option></select></div></div>
          <p className="table-caption">{view === "saved" ? "이 브라우저에 저장한 단지 · 저장 당시 가격이며 자동 갱신되지 않습니다." : "실거래는 체결된 가격, 호가는 매도자가 제시한 가격입니다."}</p>
          <PriceList candidates={displayed} contextFor={contextFor} onDetail={openDetail} onBookmark={toggleBookmark} isBookmarked={isBookmarked}/>
          {!displayed.length && <Empty title={view === "saved" ? "저장된 관심단지가 없습니다" : "조건에 맞는 후보가 없습니다"} body="검색 조건을 조정하거나 다음 분석에서 다시 확인해 주세요."/>}
        </section>}
        {(view === "overview" || view === "candidates") && !busy && !!report.referenceCandidates?.length && <section className="panel"><h2>시세 참고 단지</h2><p>평균가·KB시세 등만 확인된 단지입니다. 예산 내 개별 매물이 있다는 의미는 아닙니다.</p><PriceList candidates={report.referenceCandidates.filter(c => (tab === "all" || c.province === tab) && `${c.name}${c.region}`.includes(query))} contextFor={() => report} onDetail={c => { setDetail(c); setDetailContext(report); }} onBookmark={c => toggleBookmark(c, report)} isBookmarked={c => isBookmarked(c, report)}/></section>}
        {view === "overview" && hasReport && !busy && <ReportSections report={report}/>}

        {view === "history" && <section className="panel"><div className="section-heading"><h2>저장된 브리핑 <span className="heading-count">{saved.length}</span></h2><button className="text-button" onClick={loadHistory}>보관함 새로고침 <History size={16}/></button></div>{saved.length ? <div className="history-list">{saved.map(r => <button key={r.id} onClick={() => { setReport(r); setUsage([]); setError(""); setCriteria(r.criteria); setView("overview"); }}><div className="history-icon"><FileText size={22}/></div><div><strong>{displayDate(r.createdAt)}</strong><span>{r.criteria.minBudget}~{r.criteria.maxBudget}억 · {r.criteria.workplaces.join(" · ")} · {r.candidates.length}개 후보</span></div><ChevronRight size={18}/></button>)}</div> : <Empty title="아직 저장된 브리핑이 없습니다" body="실시간 분석이 끝나면 이 브라우저의 개인 보관함에 자동으로 저장됩니다. 최근 30개 리포트를 보관합니다."/>}</section>}

        {view === "method" && <Method liveAvailable={liveAvailable}/>}
        <footer className="page-footer"><span><House size={14}/>집노트 <i/>나의 다음 집을 위한 리서치</span><span>가격과 사실은 출처의 기준일을 확인해 주세요.</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {editing && !busy && <CriteriaDialog criteria={criteria} onClose={() => setEditing(false)} onRun={run} liveAvailable={liveAvailable}/>}
    {detail && <Dialog title={detail.name} onClose={() => setDetail(null)} wide><div className="detail-location"><MapPin size={15}/>{detail.address}<Badge status={detail.status}/></div>{(detailContext ?? report).mode === "demo" && <div className="detail-demo">가상 단지 · 아래 모든 가격과 정보는 기능 체험용 예시입니다.</div>}<div className="detail-metrics"><div><span>전용면적</span><strong>{detail.area}㎡</strong></div><div><span>최근 확인 거래</span><strong>{money(detail.trades.at(-1)?.value ?? null)}</strong></div><div><span>세대수 / 준공</span><strong>{detail.households?.toLocaleString() ?? "미확인"} / {detail.builtYear ?? "미확인"}</strong></div></div><p><strong>{priceBasis(detail)}</strong></p><p>{detail.summary}</p><SourceLinks ids={detail.sourceIds} report={detailContext ?? report}/><h3 className="detail-heading">최근 확인 실거래 흐름</h3><Sparkline values={detail.trades.map(t => t.value)} large/><p className="small muted">확인된 거래 순서 · 시간축 간격은 실제 거래일 간격과 다릅니다.</p><div className="trade-list">{detail.trades.length ? detail.trades.map((t,i) => <div key={i}><span>{t.date} · {t.floor}</span><strong>{money(t.value)}</strong><SourceLinks ids={t.sourceIds} report={detailContext ?? report}/></div>) : <p>확인된 거래가 없습니다.</p>}</div><div className="detail-asking"><span>현재 호가</span><strong>{detail.askingMin === null ? "미확인" : `${money(detail.askingMin)} ~ ${money(detail.askingMax)}`}</strong><span>{detail.askingDate ?? "확인일 없음"}</span><SourceLinks ids={detail.askingSourceIds} report={detailContext ?? report}/></div>{!!detail.referencePrices?.length && <><h3 className="detail-heading">참고시세 · 개별 매물 호가 아님</h3>{detail.referencePrices.map((r,i) => <div key={i} className="factor"><strong>{r.kind} {money(r.value)}</strong><p>{r.date} 기준 · {r.area === null ? "대상 면적 미확인" : `전용 ${r.area}㎡`}</p><SourceLinks ids={r.sourceIds} report={detailContext ?? report}/></div>)}</>}<h3 className="detail-heading">입지와 투자 관점</h3><p className="commute-line"><TrainFront size={17}/>{detail.commute}</p>{detail.factors.map((f,i) => <div className="factor" key={i}><h4>{f.title}</h4><p>{f.body}</p><SourceLinks ids={f.sourceIds} report={detailContext ?? report}/></div>)}<h3 className="detail-heading">함께 살펴볼 리스크</h3><ul className="risk-list">{detail.risks.map((r,i) => <li key={i}>{r}</li>)}</ul><button className="primary-button full-width" onClick={() => toggleBookmark(detail, detailContext ?? report)}><Bookmark size={16}/>{isBookmarked(detail, detailContext ?? report) ? "관심단지에서 해제" : "관심단지에 저장"}</button></Dialog>}
  </div>;
}

function Empty({ title, body }: { title: string; body: string }) { return <div className="empty"><Search size={30}/><h3>{title}</h3><p>{body}</p></div>; }

function CriteriaDialog({ criteria, onClose, onRun, liveAvailable }: { criteria: Criteria | null; onClose: () => void; onRun: (criteria: Criteria) => void; liveAvailable: boolean }) {
  const [min, setMin] = useState(criteria ? String(criteria.minBudget) : ""); const [max, setMax] = useState(criteria ? String(criteria.maxBudget) : "");
  const [workplaces, setWorkplaces] = useState(criteria?.workplaces.join(", ") ?? ""); const [excluded, setExcluded] = useState(criteria?.excludedRegions.join(", ") ?? "");
  const [area, setArea] = useState(String(criteria?.minArea ?? 59)); const [commute, setCommute] = useState(String(criteria?.commuteMinutes ?? 60)); const [advanced, setAdvanced] = useState(false); const [error, setError] = useState("");
  function submit() {
    const split = (s: string) => [...new Set(s.split(/[,\n]/).map(v => v.trim()).filter(Boolean))];
    const result = CriteriaSchema.safeParse({ minBudget: Number(min), maxBudget: Number(max), workplaces: split(workplaces), excludedRegions: split(excluded), minArea: Number(area), commuteMinutes: Number(commute) });
    if (!result.success) { setError("예산은 0.5~200억 범위에서 최소 ≤ 최대로 입력하고, 직장 위치는 2자 이상 최대 3곳으로 입력해 주세요. 면적은 20~300㎡, 통근은 15~180분입니다."); return; }
    onRun(result.data);
  }
  return <Dialog title="어떤 집을 찾고 계신가요?" onClose={onClose}><p className="dialog-description">예산과 직장만 알려주세요.<br/>실거주성과 중장기 투자 가치는 집노트가 함께 살핍니다.</p><form onSubmit={(e: FormEvent) => { e.preventDefault(); submit(); }}><label className="field">매매 예산 <span>억원</span><div className="budget-inputs"><input required aria-label="최소 예산" inputMode="decimal" type="number" min="0.5" max="200" step="0.1" value={min} onChange={e => setMin(e.target.value)}/><span>~</span><input required aria-label="최대 예산" inputMode="decimal" type="number" min="0.5" max="200" step="0.1" value={max} onChange={e => setMax(e.target.value)}/></div></label><label className="field">직장 또는 주요 목적지<input required value={workplaces} maxLength={244} onChange={e => setWorkplaces(e.target.value)} placeholder="직장 근처 역명이나 지역을 입력하세요"/><small>역명이나 지역을 입력하세요. 쉼표로 최대 3곳 · 목적지 중 한 곳 접근성 기준</small></label><label className="field">제외지역 <span>선택사항</span><input value={excluded} maxLength={1230} onChange={e => setExcluded(e.target.value)} placeholder="예: 노원구, 도봉구, 은평구 불광동"/><small>입력하지 않으면 제외지역 없이 검색합니다. 시·구·동 이름을 쉼표로 구분하세요.</small></label><button type="button" className="advanced-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}><Settings2 size={16}/>기본 조건 조정 <ChevronDown size={16}/></button>{advanced && <div className="advanced-fields"><label className="field">최소 전용면적 (㎡)<input type="number" min="20" max="300" required value={area} onChange={e => setArea(e.target.value)}/></label><label className="field">통근 기준 (분 안팎)<input type="number" min="15" max="180" required value={commute} onChange={e => setCommute(e.target.value)}/></label></div>}<div className="defaults-note"><ShieldCheck size={17}/><span>아파트 매매 · 실거주 + 투자 균형 · 전용 {area}㎡ 이상<br/>서울·경기 통합 비교 · 공식 출처 우선</span></div>{!liveAvailable && <div className="setup-note"><Info size={16}/><span>실시간 분석 연결 전입니다. 서버의 <code>.env.local</code>에 <code>OPENAI_API_KEY</code>를 설정하면 사용할 수 있습니다.</span></div>}{error && <p role="alert" className="form-error">{error}</p>}<button type="submit" className="primary-button full-width" disabled={!liveAvailable}><Sparkles size={17}/>내 조건으로 최신 자료 분석<ArrowRight size={17}/></button></form></Dialog>;
}

function ReportSections({ report }: { report: Report }) {
  return <div className="report-sections">
    <section className="panel"><div className="section-heading"><div><span className="eyebrow">PRICE MOVEMENTS</span><h2>의미 있는 가격 변화</h2></div><span className="subtle-label">±3% 또는 ±5천만원 이상</span></div><p className="section-description">전일 비교 자료가 없어 동일 전용면적의 직전 확인 거래와 비교합니다. 층·동·상태 차이를 함께 확인하세요.</p>{report.changes.length ? report.changes.map((c,i) => <div key={i} className="change-row"><span className={`change-icon ${c.percent < 0 ? "down" : ""}`}>{c.percent < 0 ? <ArrowDown size={20}/> : <ArrowUpRight size={20}/>}</span><div><strong>{c.name} <span className="small muted">{c.area}㎡</span></strong><p>{c.basis}</p><SourceLinks ids={c.sourceIds} report={report}/></div><div className="change-price"><strong>{c.percent > 0 ? "+" : ""}{c.percent}%</strong><span>{money(c.before)} → {money(c.after)}</span></div></div>) : <p className="empty-inline">기준을 충족하는 가격 변화가 확인되지 않았습니다. 거래 자료 부족은 가격 보합을 뜻하지 않습니다.</p>}</section>
    <details className="panel sources-panel"><summary><div><span className="eyebrow">SOURCES & SCOPE</span><h2>정보 출처와 확인 범위</h2></div><ChevronDown size={20}/></summary>{report.sources.length ? <div className="source-list">{report.sources.filter(s => safeUrl(s.url)).map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer"><span><strong>{s.name}</strong><span>{s.kind} · 확인 {s.checkedAt}</span></span><ArrowUpRight size={17}/></a>)}</div> : <p className="muted">확인된 시세 출처가 없습니다.</p>}<ul className="limitations">{report.limitations.map((l,i) => <li key={i}>{l}</li>)}</ul></details>
  </div>;
}

function Method({ liveAvailable }: { liveAvailable: boolean }) {
  const factors = ["상급지 대비 가격 차이", "핵심 업무지구·직장 접근성", "교통 호재 확정도와 개통 시점", "정비사업 진행 단계", "향후 2~3년 입주·공급 부담", "학군·상권·생활 인프라", "전세가율과 실수요", "거래량과 가격 회복 탄력성", "대단지·브랜드·역세권", "지역 랜드마크와 갈아타기 수요"];
  return <div className="method-content"><section className="panel"><span className="eyebrow">OUR PRINCIPLES</span><h2>주소보다, 같은 예산의 가치를 봅니다.</h2><p>서울과 경기를 동일한 기준으로 비교합니다. 통근은 주요 목적지 중 한 곳까지 약 1시간 안팎을 기본으로 하되, 중장기 가치와 실제 생활 여건을 더 넓게 살핍니다. 기본 제외지역은 없습니다.</p><div className="method-grid">{factors.map((f,i) => <div key={f}><span>{String(i+1).padStart(2,"0")}</span><strong>{f}</strong></div>)}</div></section><section className="panel"><h2>검증과 한계도 함께 보여드립니다.</h2><div className="factor"><h3>실거래와 호가를 구분합니다</h3><p>국토교통부 공개자료를 우선하고 서울·경기 포털과 신뢰도 높은 시세 자료를 교차 확인합니다. 직접 접근할 수 없는 자료는 미확인으로 남깁니다. 최근 거래는 현재 매물 가격을 보장하지 않습니다.</p></div><div className="factor"><h3>넓은 검색은 거래 원장 전수조사와 다릅니다</h3><p>매번 서울·경기 권역을 새로 검색하지만, 공개 웹에서 모든 단지·매물을 조회할 수는 없습니다. 검색 범위 누락과 출처가 부족한 후보를 분리하고 점수는 정성 평가로 표시합니다.</p></div><div className="factor"><h3>내보내기와 보관</h3><p>실시간 리포트는 서버에 최근 30개까지 저장됩니다. 브라우저의 개인 식별 쿠키를 지우면 기존 보관함에 접근할 수 없습니다. 중요한 리포트는 JSON으로 내보내세요. 관심단지는 회원가입 없이 이 브라우저의 로컬스토리지에 단지 정보와 출처를 함께 저장합니다. 북마크를 다시 누르면 삭제되며 새로고침하거나 리포트를 바꿔도 유지됩니다. 저장 당시 정보이며 자동 갱신되지 않습니다.</p></div><div className="factor"><h3>분석 실행 방식</h3><p>현재 버전은 버튼을 눌러 실행합니다. 자동 일일 실행과 이메일 발송은 연결되어 있지 않습니다. 자동화 확장 시에는 사용자 계정, 실행 스케줄러, 알림 채널을 추가할 수 있습니다.</p></div><div className="connection-status"><span className={liveAvailable ? "connected" : ""}/>{liveAvailable ? "실시간 검색 API 설정됨 · 실제 요청 성공 여부는 실행 시 확인" : "실시간 검색 API 미연결"}</div></section></div>;
}
