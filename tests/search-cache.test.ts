import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { cachedSearch, readSearches, saveSearch, searchKey } from "../lib/search-cache";

test("saved responses survive validation failures, isolate sessions, expire and avoid incomplete reuse", async () => {
  const previous = process.env.DATA_DIR;
  const directory = await mkdtemp(path.join(tmpdir(), "search-cache-"));
  process.env.DATA_DIR = directory;
  try {
    const session = randomUUID();
    const base = { key: searchKey("conditions", "prompt", "nano"), createdAt: new Date().toISOString(), stage: "prices", status: "completed", outputText: '{"candidates":[]}', urls: ["https://example.com/apt/1"] };
    await saveSearch(session, base);
    assert.equal((await cachedSearch(session, base.key))?.outputText, base.outputText);
    assert.equal(await cachedSearch(randomUUID(), base.key), undefined);
    await saveSearch(session, { ...base, status: "incomplete", outputText: '{"candidates":' });
    assert.equal(await cachedSearch(session, base.key), undefined);
    assert.equal((await readSearches(session))[0].outputText, '{"candidates":');
    await saveSearch(session, { ...base, createdAt: new Date(Date.now() - 31 * 60000).toISOString() });
    assert.equal(await cachedSearch(session, base.key), undefined);
    assert.equal((await stat(path.join(directory, "search-responses", `${session}.json`))).mode & 0o777, 0o600);
    await assert.rejects(readSearches("../other"));
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
