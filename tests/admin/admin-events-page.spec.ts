import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, signedIn, totp } from "../phase1/helpers";

// Lane A Q45 (migration 202610291052): /admin/events is filtered, sorted and keyset-paged in SQL by admin_events_page().
// Read-only: the demo admin reads; a disposable non-admin is refused. Nothing is written.
type Page = { rows: { id: string; featured: number; gross: number; visibility: string }[]; next: Record<string, unknown> | null; filtered: number;
  totals: { all: number; pub: number; tix: number; live: number; flag: number }; cities: string[]; types: string[] };
const call = (c: SupabaseClient, filters: Record<string, string> = {}, sort = "featured", limit = 50, after: unknown = null) =>
  c.rpc("admin_events_page" as never, { p_filters: filters, p_sort: sort, p_limit: limit, p_after: after } as never) as unknown as Promise<{ data: Page | null; error: { code?: string; message: string } | null }>;

test.describe.configure({ mode: "serial" });
test.describe("admin_events_page", () => {
  let aal1: SupabaseClient, aal2: SupabaseClient, outsider: SupabaseClient;
  test.beforeAll(async () => {
    const email = "admin.demo@example.com", password = process.env.DEMO_ADMIN_PASSWORD!, secret = process.env.DEMO_ADMIN_TOTP_SECRET!;
    test.skip(!password || !secret, "demo admin credentials not configured");
    aal1 = anon() as unknown as SupabaseClient; expect((await aal1.auth.signInWithPassword({ email, password })).error).toBeNull();
    aal2 = anon() as unknown as SupabaseClient; expect((await aal2.auth.signInWithPassword({ email, password })).error).toBeNull();
    const { data: factors } = await aal2.auth.mfa.listFactors();
    const factor = factors?.totp?.[0]; expect(factor).toBeTruthy();
    expect((await aal2.auth.mfa.challengeAndVerify({ factorId: factor!.id, code: totp(secret) })).error).toBeNull();
    const u = await createUser("q45-events-outsider");
    outsider = (await signedIn(u.email)) as unknown as SupabaseClient;
  });
  test.afterAll(async () => { await cleanup(); });

  test("refused for a non-admin and for an admin on aal1", async () => {
    for (const c of [outsider, aal1]) {
      const r = await call(c);
      expect(r.data).toBeNull();
      expect(r.error?.code).toBe("42501");
    }
  });

  test("aal2 admin: totals match the table, first page is 50", async () => {
    const { data, error } = await call(aal2);
    expect(error).toBeNull();
    const { count } = await admin.from("events").select("id", { count: "exact", head: true });
    const { count: pub } = await admin.from("events").select("id", { count: "exact", head: true }).eq("visibility", "public");
    expect(data!.totals.all).toBe(count);
    expect(data!.filtered).toBe(count);
    expect(data!.totals.pub).toBe(pub);
    expect(data!.rows.length).toBe(Math.min(50, count ?? 0));
    expect(data!.cities.length).toBeGreaterThan(0);
  });

  for (const sort of ["featured", "newest", "starts", "name"]) {
    test(`keyset pages (${sort}) neither overlap nor skip`, async () => {
      const seen = new Set<string>(); let after: unknown = null, pages = 0, total = 0;
      do {
        const { data, error } = await call(aal2, {}, sort, 41, after);
        expect(error).toBeNull();
        total = data!.filtered;
        for (const r of data!.rows) { expect(seen.has(r.id)).toBe(false); seen.add(r.id); }
        after = data!.next; pages++;
      } while (after && pages < 100);
      expect(seen.size).toBe(total);
    });
  }

  test("default order is featured, then revenue (desc); filters agree", async () => {
    const { data } = await call(aal2, {}, "featured", 200);
    const rows = data!.rows;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!, b = rows[i]!;
      expect(a.featured > b.featured || (a.featured === b.featured && Number(a.gross) >= Number(b.gross))).toBe(true);
    }
    const priv = await call(aal2, { vis: "private" }, "newest", 200);
    expect(priv.data!.rows.every(r => r.visibility === "private")).toBe(true);
    const tab = await call(aal2, { tab: "public" });
    expect(tab.data!.filtered).toBe(tab.data!.totals.pub);
  });
});
