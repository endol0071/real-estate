import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { validSession } from "./store";

export type StoredSearch = { key: string; createdAt: string; stage: string; status: string; outputText: string; urls: string[] };
function file(session: string) {
  if (!validSession(session)) throw new Error("Invalid session");
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "search-responses", `${session}.json`);
}
export function searchKey(input: string, instructions: string, model: string) {
  return createHash("sha256").update(JSON.stringify({ input, instructions, model })).digest("hex");
}
export async function readSearches(session: string): Promise<StoredSearch[]> {
  try { return JSON.parse(await readFile(file(session), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
}
export async function cachedSearch(session: string, key: string): Promise<StoredSearch | undefined> {
  return (await readSearches(session)).find(r => r.key === key && r.status === "completed" && Date.now() - Date.parse(r.createdAt) >= 0 && Date.now() - Date.parse(r.createdAt) < 30 * 60_000);
}
// Retain even incomplete/malformed output for inspection without another paid request.
export async function saveSearch(session: string, record: StoredSearch) {
  const target = file(session);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const previous = await readSearches(session);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify([record, ...previous.filter(r => r.key !== record.key)].slice(0, 24)), { mode: 0o600 });
  await rename(temporary, target);
}
