// Normalize only presentation differences, never apartment ids or meaningful query values.
export function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch { return ""; }
}
export function observedUrl(raw: string, urls: Set<string>): boolean {
  const key = canonicalUrl(raw);
  return !!key && [...urls].some(url => canonicalUrl(url) === key);
}
const addressKey = (s: string) => s.normalize("NFKC").replace(/서울특별시|서울시/g, "서울").replace(/경기도/g, "경기").replace(/[\s,·]/g, "");
const nameKey = (s: string) => s.normalize("NFKC").replace(/[\s·-]/g, "").replace(/아파트$/, "");
function district(s: string) { return s.match(/[가-힣]+(?:시|군|구)(?=\s|$)/g)?.filter(v => !["서울시", "서울특별시"].includes(v)) ?? []; }
export function sameApartment(lead: { name: string; address: string; url: string }, candidate: { name: string; address: string }, evidenceUrls: string[]): boolean {
  if (nameKey(lead.name) !== nameKey(candidate.name)) return false;
  const a = addressKey(lead.address), b = addressKey(candidate.address);
  if (!a || !b) return false;
  // Conflicting provinces or district identities must not be rescued by a shared URL.
  if ((a.startsWith("서울") && b.startsWith("경기")) || (a.startsWith("경기") && b.startsWith("서울"))) return false;
  const da = district(lead.address), db = district(candidate.address);
  if (da.length && db.length && !da.every(v => db.includes(v))) return false;
  if (b.includes(a)) return true;
  // Road-name vs neighborhood address can match only with the same detailed source page.
  try {
    const u = new URL(lead.url);
    const detailed = u.pathname.split("/").filter(Boolean).length >= 2 || /\d/.test(u.pathname) || [...u.searchParams.keys()].some(k => /^(id|complexNo|aptId)$/i.test(k));
    return detailed && da.length > 0 && db.length > 0 && evidenceUrls.some(url => canonicalUrl(url) === canonicalUrl(lead.url));
  } catch { return false; }
}
