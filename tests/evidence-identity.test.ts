import { test } from "node:test";
import assert from "node:assert/strict";
import { observedUrl, sameApartment } from "../lib/evidence-identity";
test("URL matching retains resource identity while ignoring tracking and fragments", () => {
  assert.ok(observedUrl("https://example.com/apt/12?utm_source=x#price", new Set(["https://example.com/apt/12"])));
  assert.ok(!observedUrl("https://example.com/apt?id=12", new Set(["https://example.com/apt?id=13"])));
  assert.ok(!observedUrl("https://other.com/apt/12", new Set(["https://example.com/apt/12"])));
});
test("same names in different districts and different numbered complexes remain separate", () => {
  const lead = { name: "테스트1단지", address: "서울 동작구 상도동", url: "https://example.com/apt/12" };
  assert.ok(!sameApartment(lead, { name: lead.name, address: "서울 강남구 역삼동" }, [lead.url]));
  assert.ok(!sameApartment(lead, { name: "테스트2단지", address: lead.address }, [lead.url]));
  assert.ok(!sameApartment({ ...lead, url: "https://example.com" }, { name: lead.name, address: "서울 동작구 상도로 12" }, ["https://example.com"]));
});
