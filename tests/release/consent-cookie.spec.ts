import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mergeConsent } from "../../src/lib/consent/cookie";

// Coordinator decision 1 (W01): every gd_consent writer merges its own purpose into the cookie and never overwrites the others.
// No browser: pure-function checks, a source check that all three writers use the helper, and an API-level round trip.

test("mergeConsent sets one purpose and keeps every other recorded choice", () => {
  expect(mergeConsent(null, "analytics", true)).toBe("analytics:yes");
  expect(mergeConsent("referral:yes", "analytics", false)).toBe("referral:yes,analytics:no");
  expect(mergeConsent("referral:yes,analytics:no", "analytics", true)).toBe("referral:yes,analytics:yes");
  expect(mergeConsent("analytics:yes", "referral", false)).toBe("analytics:yes,referral:no");
  expect(mergeConsent(encodeURIComponent("referral:no,analytics:yes"), "referral", true)).toBe("analytics:yes,referral:yes");
  // Malformed parts and duplicates are dropped; the value stays parseable by every reader.
  expect(mergeConsent("junk,<x>,referral:yes,referral:no", "analytics", true)).toBe("referral:yes,analytics:yes");
  const v = mergeConsent(mergeConsent("", "referral", true), "analytics", true);
  // Same parsing as cookieConsent() (analytics) and consentOf() / the /r route (referral).
  expect(v.split(",").find(x => x.startsWith("analytics:"))).toBe("analytics:yes");
  expect(/referral:yes/.test(v)).toBe(true);
});

test("all three gd_consent writers use the shared merge helper (no whole-value overwrite)", () => {
  for (const f of ["src/app/api/consent/route.ts", "src/app/r/[code]/consent/page.tsx", "src/app/ref/[code]/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    expect(src, f).toContain("mergeConsent(");
    expect(src, f).not.toMatch(/set\("gd_consent",\s*`/);
  }
});

test("POST /api/consent merges with an existing referral choice", async ({ request }) => {
  const r = await request.post("/api/consent", { data: { analytics: false }, headers: { cookie: "gd_consent=referral%3Ayes" } });
  expect(r.status()).toBe(200);
  const set = r.headersArray().filter(h => h.name.toLowerCase() === "set-cookie").map(h => h.value).find(v => v.startsWith("gd_consent="))!;
  expect(decodeURIComponent(set.split(";")[0]!.split("=")[1]!)).toBe("referral:yes,analytics:no");
  expect(set).toMatch(/HttpOnly/i);
});
