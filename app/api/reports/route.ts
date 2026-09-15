import { CriteriaSchema } from "@/lib/schema";
import { acquire, authorized, release, sameOrigin, sessionId } from "@/lib/access";
import { readReports, saveReport } from "@/lib/store";
import { research } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "사이트 접근 암호를 확인해 주세요." }, { status: 401 });
  try { return Response.json({ reports: await readReports(await sessionId()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "저장된 리포트를 읽지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !authorized(request)) return Response.json({ error: "접근 권한이 없습니다. 사이트 접근 암호를 확인해 주세요." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 8192) return Response.json({ error: "입력값이 너무 깁니다." }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return Response.json({ error: "입력 형식이 올바르지 않습니다." }, { status: 400 }); }
  const parsed = CriteriaSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "검색 조건을 확인해 주세요." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "실시간 분석은 서버의 .env.local에 OPENAI_API_KEY를 설정한 후 사용할 수 있습니다. 데모는 바로 체험할 수 있습니다." }, { status: 503 });
  const session = await sessionId();
  if (!acquire(session)) return Response.json({ error: "분석이 진행 중이거나 시간당 실행 한도에 도달했습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 270_000);
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(out) {
      let closed = false;
      const send = (event: string, data: unknown) => { if (!closed) { try { out.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; controller.abort(); } } };
      const heartbeat = setInterval(() => send("heartbeat", {}), 15_000);
      try {
        const reports = await readReports(session);
        const previous = reports.find(r => JSON.stringify(r.criteria) === JSON.stringify(parsed.data));
        const report = await research(parsed.data, previous, message => send("progress", { message }), controller.signal);
        if (controller.signal.aborted) throw new Error("분석이 취소되었습니다.");
        await saveReport(session, report);
        send("result", report);
      } catch (error) {
        const status = (error as { status?: number }).status;
        const message = controller.signal.aborted ? "분석이 중단되었거나 제한 시간을 초과했습니다. 다시 시도해 주세요." : status === 401 ? "서버 API 키가 유효하지 않습니다." : status === 429 ? "AI 서비스 사용 한도를 확인해 주세요." : "자료 검색 또는 리포트 저장에 실패했습니다. API 모델·권한·서버 저장 경로를 확인한 후 다시 시도해 주세요.";
        send("error", { message });
      } finally {
        clearTimeout(timeout); clearInterval(heartbeat); release(session);
        request.signal.removeEventListener("abort", abort);
        if (!closed) { closed = true; out.close(); }
      }
    },
    cancel() { controller.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
