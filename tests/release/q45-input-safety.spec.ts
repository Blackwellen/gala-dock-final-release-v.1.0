import { test, expect } from "@playwright/test";
import { safeNext } from "../../src/lib/redirects";
import { BASE } from "../phase1/helpers";

// Q45 input-safety and response-header evidence (no browser). Open redirects (unit + live HTTP), the stored-markup guard from
// migration 202610293033 (rolled-back SQL through the management API) and security headers on every route class.
const REF = process.env.SUPABASE_PROJECT_REF, PAT = process.env.SUPABASE_PAT_KEY;
async function sql<T>(query: string, attempt = 0): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(120_000) });
  const t = await r.text();
  if (r.status === 429 && attempt < 8) { await new Promise(res => setTimeout(res, 5_000 * (attempt + 1))); return sql<T>(query, attempt + 1); }
  if (!r.ok) throw new Error(`sql HTTP ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t) as T[];
}
const EVIL = ["//evil.example", "/\\evil.example", "/%2F%2Fevil.example", "/%5Cevil.example", "https://evil.example", "\t//evil.example", "javascript:alert(1)",
  "/\u0000//evil.example", "///evil.example", "http:evil.example"];

test.describe("Q45 input safety", () => {
  test("safeNext keeps only same-origin relative paths", () => {
    for (const v of EVIL) expect(safeNext(v, "/continue"), v).toBe("/continue");
    expect(safeNext("/events/neon-nights?x=1#t")).toBe("/events/neon-nights?x=1#t");
  });

  test("redirecting routes never leave the origin", async () => {
    const probes = [...EVIL.map(v => `/continue?next=${encodeURIComponent(v)}`), "/api/boosts/00000000-0000-0000-0000-000000000000/click?to=%2F%2Fevil.example",
      "/api/boosts/x/click?to=https%3A%2F%2Fevil.example", "/r/abc?c=x", "/auth/callback?next=%2F%2Fevil.example&code=x",
      "/auth/confirm?next=https%3A%2F%2Fevil.example&token_hash=x&type=email"];
    for (const p of probes) {
      const r = await fetch(BASE + p, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
      const loc = r.headers.get("location");
      if (loc) expect(new URL(loc, BASE).origin, `${p} → ${loc}`).toBe(new URL(BASE).origin);
    }
  });

  test("stored design / venue-plan markup cannot carry script (Q45-S01 guard)", async () => {
    test.skip(!REF || !PAT, "needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY");
    const payloads = ["<image/onerror=alert(1)/href=x>", "<image\\tonerror=alert(1) href=x>", "<a href=\"java&#115;cript:alert(1)\">x</a>", "<foreignObject><div/></foreignObject>",
      "#000\\\" onmouseover=\\\"alert(1)"];
    const rows = await sql<{ v: string; refused: boolean }>(`select v, public.design_active_content(jsonb_build_object('layers', jsonb_build_array(jsonb_build_object('svg',
      jsonb_build_object('body', v))))) is not null refused from unnest(array[${payloads.map(p => `E'${p.replace(/'/g, "''")}'`).join(",")}]) v`);
    expect(rows.filter(r => !r.refused).map(r => r.v)).toEqual([]);
    const benign = await sql<{ ok: boolean }>(`select public.design_active_content('{"t": "Join online = free", "s": "<path d=\\"M0 0h24\\"/>"}'::jsonb) is null ok`);
    expect(benign[0].ok).toBe(true);
    const trig = await sql<{ n: number }>(`select count(*)::int n from pg_trigger where tgname = 'gd_q45_active_content'`);
    expect(trig[0].n).toBe(6);
  });

  test("security headers on every route class", async () => {
    const classes: Record<string, string> = { public: "/", event: "/events", auth: "/login", app: "/organizer", admin: "/admin/login", token: "/portal/q45-not-a-token",
      api: "/api/health", webhook: "/api/webhooks/stripe" };
    for (const [cls, p] of Object.entries(classes)) {
      const r = await fetch(BASE + p, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
      const h = (k: string) => r.headers.get(k) ?? "";
      expect(h("x-content-type-options"), cls).toBe("nosniff");
      expect(h("strict-transport-security"), cls).toMatch(/max-age=63072000; includeSubDomains/);
      expect(h("content-security-policy"), cls).toMatch(/frame-ancestors '(none|self)'/);
      expect(h("content-security-policy"), cls).toMatch(/object-src 'none'/);
      expect(h("permissions-policy"), cls).toMatch(/microphone=\(\)/);
      expect(h("referrer-policy"), cls).toMatch(/strict-origin-when-cross-origin|no-referrer/);
      expect(h("cross-origin-opener-policy"), cls).toBe("same-origin-allow-popups");
      expect(h("x-permitted-cross-domain-policies"), cls).toBe("none");
      if (cls === "token") { expect(h("referrer-policy")).toBe("no-referrer"); expect(h("x-robots-tag")).toMatch(/noindex/); expect(h("cache-control")).toMatch(/no-store/); }
      if (cls === "api" || cls === "auth") expect(h("cache-control"), cls).toMatch(/no-store/);
    }
  });
});
