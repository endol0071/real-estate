export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ liveAvailable: !!process.env.OPENAI_API_KEY?.trim() }, { headers: { "Cache-Control": "no-store" } });
}
