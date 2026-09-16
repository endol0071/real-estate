import { test } from "node:test";
import assert from "node:assert/strict";
import { bookmarkKey, decodeBookmarks, encodeBookmarks, snapshot } from "../lib/bookmarks";
import { createDemo } from "./fixtures/demo";

test("saved candidates and sources can be reopened without their original report", () => {
  const report = createDemo();
  report.sources = [{ id: "example", name: "Test", url: "https://example.com", kind: "test", checkedAt: "2026-09-15" }];
  const entry = snapshot(report.candidates[0], report);
  const restored = decodeBookmarks(encodeBookmarks([entry]));
  assert.deepEqual(restored[0], entry);
  assert.equal(restored[0].sources[0].id, "example");
  assert.deepEqual(decodeBookmarks(encodeBookmarks(restored.filter(b => b.key !== entry.key))), []);
});
test("legacy bookmarks migrate with original mode and no duplicate entries", () => {
  const report = createDemo(); const candidate = report.candidates[0];
  const restored = decodeBookmarks(JSON.stringify([bookmarkKey(candidate, "demo")]), [report, report]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].candidate.name, candidate.name);
  assert.notEqual(bookmarkKey(candidate, "live"), bookmarkKey(candidate, "demo"));
});
test("invalid storage and capacity limits do not silently overwrite saved data", () => {
  assert.deepEqual(decodeBookmarks(null), []);
  assert.throws(() => decodeBookmarks("not json"));
  assert.throws(() => decodeBookmarks('{"version":2,"items":[{}]}'));
  const report = createDemo();
  assert.throws(() => encodeBookmarks(Array(101).fill(snapshot(report.candidates[0], report))));
});
