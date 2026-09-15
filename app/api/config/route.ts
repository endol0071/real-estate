export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ liveAvailable: !!process.env.OPENAI_API_KEY, passwordRequired: !!process.env.APP_PASSWORD }, { headers: { "Cache-Control": "no-store" } });
}
