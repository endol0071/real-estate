import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ReportSchema, type Report } from "./schema";

export const validSession = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
function location(session: string) {
  if (!validSession(session)) throw new Error("Invalid session");
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), `${session}.json`);
}
export async function readReports(session: string): Promise<Report[]> {
  try {
    return ReportSchema.array().parse(JSON.parse(await readFile(location(session), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("저장된 리포트를 읽을 수 없습니다. 데이터 파일을 확인해 주세요.");
  }
}
export async function saveReport(session: string, report: Report) {
  const file = location(session);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const reports = await readReports(session);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify([report, ...reports].slice(0, 30)), { mode: 0o600 });
  await rename(temporary, file);
}
