import { CriteriaSchema } from "@/lib/schema";
import { acquire, release, sameOrigin, sessionId } from "@/lib/access";
import { readReports, saveReport } from "@/lib/store";
import { research } from "@/lib/research";
import { researchErrorMessage } from "@/lib/research-error";
import { errorDiagnostics } from "@/lib/api-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET() {
  try { return Response.json({ reports: await readReports(await sessionId()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "저장된 리포트를 읽지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "이 사이트에서 분석을 실행해 주세요." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 8192) return Response.json({ error: "입력값이 너무 깁니다." }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return Response.json({ error: "입력 형식이 올바르지 않습니다." }, { status: 400 }); }
  const parsed = CriteriaSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "검색 조건을 확인해 주세요." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY?.trim()) return Response.json({ error: "서버의 .env.local에 OPENAI_API_KEY를 설정한 후 분석을 실행해 주세요." }, { status: 503 });
  const session = await sessionId();
  if (!acquire(session)) return Response.json({ error: "이 사이트의 동시 분석 또는 시간당 실행 한도에 도달했습니다. OpenAI 크레딧과는 별개입니다. 진행 중인 분석을 마친 후 잠시 후 다시 시도해 주세요.", code: "app_rate_limit" }, { status: 429 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 570_000);
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
        const report = await research(parsed.data, message => send("progress", { message }), controller.signal, usage => {
          send("usage", usage);
          console.info("[research usage]", JSON.stringify(usage));
        }, session);
        if (controller.signal.aborted) throw new Error("분석이 취소되었습니다.");
        await saveReport(session, report);
        send("result", report);
      } catch (error) {
        const message = researchErrorMessage(error, controller.signal.aborted);
        console.warn("[research failure]", JSON.stringify(errorDiagnostics(error)));
        send("error", { message, ...errorDiagnostics(error) });
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
