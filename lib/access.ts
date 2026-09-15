import { cookies } from "next/headers";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { validSession } from "./store";

export function authorized(request: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    // Refuse paid anonymous requests in production unless an operator configured access.
    const host = new URL(request.url).hostname;
    return process.env.NODE_ENV !== "production" || ["localhost", "127.0.0.1", "[::1]"].includes(host);
  }
  const supplied = request.headers.get("x-app-password") || "";
  return timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest());
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function sessionId() {
  const jar = await cookies();
  const saved = jar.get("jipnote-session")?.value;
  if (saved && validSession(saved)) return saved;
  const id = randomUUID();
  jar.set("jipnote-session", id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return id;
}

// Single-process admission control: at most 2 research jobs globally, 1 per session,
// 6 requests/hour per session and 20 total/hour. A distributed deployment needs Redis.
const active = new Set<string>();
let recent: { session: string; at: number }[] = [];
export function acquire(session: string) {
  const now = Date.now();
  recent = recent.filter(r => now - r.at < 3_600_000);
  if (active.has(session) || active.size >= 2 || recent.length >= 20 || recent.filter(r => r.session === session).length >= 6) return false;
  active.add(session); recent.push({ session, at: now }); return true;
}
export function release(session: string) { active.delete(session); }
