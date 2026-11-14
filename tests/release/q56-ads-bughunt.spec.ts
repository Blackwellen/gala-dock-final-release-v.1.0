import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boostStartIso, londonToday, BOOST_PLACEMENT } from "../../src/lib/ads/flight";
import { boostCheckoutParams } from "../../src/lib/ads/checkout";
import { interleave, windowIds } from "../../src/lib/ads/core";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Q56 ads bug hunt (phase A). Pure + source checks, then live-DB checks with the service role / a signed-in organiser (no browser,
// no dev server). The full DB walk-through (matching, pause, suspension, kill switch, late payment, refund) is the exercise
// scripts/db/exercises/202611148761_ads_bughunt.sql, run by migrate.mjs dry-run/apply.
const src = (p: string) => readFileSync(p, "utf8");
const db = admin as unknown as SupabaseClient;
const day = 864e5;

test.describe("Q56 · boost start dates are London days", () => {
  test("today starts now; a later day starts at 00:00 London (GMT and BST); junk is refused", () => {
    const now = new Date("2026-11-14T15:30:00Z");                                    // after 09:00 — the old flow failed here
    expect(londonToday(now)).toBe("2026-11-14");
    expect(boostStartIso("2026-11-14", now)).toBeNull();
    expect(boostStartIso("2026-11-13", now)).toBeNull();
    expect(boostStartIso(null, now)).toBeNull();
    expect(boostStartIso("2026-11-20", now)).toBe("2026-11-20T00:00:00.000Z");      // GMT
    expect(boostStartIso("2027-07-01", now)).toBe("2027-06-30T23:00:00.000Z");      // BST: midnight London = 23:00 UTC
    expect(boostStartIso("2026-13-40", now)).toBeUndefined();
    expect(boostStartIso("tomorrow", now)).toBeUndefined();
    // 23:30 UTC in summer is 00:30 the next day in London: the London calendar decides "today".
    expect(londonToday(new Date("2027-07-01T23:30:00Z"))).toBe("2027-07-02");
  });
  test("the dialog sends a London day, shows the VAT-inclusive total on the button and promises refunds (not credit)", () => {
    const ui = src("src/components/organizer/boost-client.tsx");
    expect(ui).toContain("starts_on: start || null");
    expect(ui).not.toContain("T09:00:00");
    expect(ui).toMatch(/Pay \{total\}/);                                            // was "Pay £49" for a £58.80 charge
    expect(ui).toContain("refunded to your card automatically");
    expect(ui).not.toContain("refunded from Money");
    expect(src("src/lib/actions/boosts.ts")).toContain("boostStartIso(p.data.starts_on)");
  });
  test("placement descriptions say where the ad really runs", () => {
    expect(BOOST_PLACEMENT.homepage).toMatch(/Discover hero/);
    expect(BOOST_PLACEMENT.search).toMatch(/Sponsored row/);
    expect(src("src/app/organizer/events/[id]/promotion/page.tsx")).not.toContain("Boosted in search results");
  });
});

test.describe("Q56 · boost checkout is a VAT receipt", () => {
  test("net + VAT lines sum to the order total; invoice with Gala Dock's VAT number; no marketplace params", () => {
    const p = boostCheckoutParams({ po: { reference: "PO-1", amount_minor: 5880, currency: "GBP", description: "Featured Event — 7 days", platform_fee_vat_minor: 980 },
      email: "a@example.test", successUrl: "https://x/ok", cancelUrl: "https://x/no", nowSec: 1_000, accountTaxIds: ["txi_123", "bad id"] });
    expect(Number(p["line_items[0][price_data][unit_amount]"]) + Number(p["line_items[1][price_data][unit_amount]"])).toBe(5880);
    expect(p["line_items[0][price_data][unit_amount]"]).toBe("4900");
    expect(p["line_items[1][price_data][product_data][name]"]).toBe("VAT at 20%");
    expect(p["invoice_creation[enabled]"]).toBe("true");
    expect(p["invoice_creation[invoice_data][account_tax_ids][0]"]).toBe("txi_123");
    expect(p["invoice_creation[invoice_data][account_tax_ids][1]"]).toBeUndefined();
    expect(p["metadata[payment_order]"]).toBe("PO-1");
    expect(p.customer).toBeUndefined();                                             // guest: never recorded as a plan invoice
    expect(Object.keys(p).some(k => /application_fee|transfer_data|on_behalf_of/.test(k))).toBe(false);
    expect(p.expires_at).toBe("4600");
    // No VAT recorded → one line, total unchanged.
    const q = boostCheckoutParams({ po: { reference: "PO-2", amount_minor: 4900, currency: "GBP", description: "x" }, email: "", successUrl: "", cancelUrl: "", nowSec: 0 });
    expect(q["line_items[0][price_data][unit_amount]"]).toBe("4900"); expect(q["line_items[1][quantity]"]).toBeUndefined();
  });
  test("undelivered spend is refunded by the payments worker", () => {
    expect(src("src/app/api/cron/payments/route.ts")).toContain("processBoostRefunds()");
    const o = src("src/lib/commerce/orchestrator.ts");
    expect(o).toContain('db.rpc("ad_credit_refunds_due"');
    expect(o).toMatch(/metadata\?\.ad_credit === r\.ledger_id/);                    // crash-safe: an existing Stripe refund is recorded, not repeated
  });
});

test.describe("Q56 · sponsored layer", () => {
  test("in-feed slots drop only subjects already in the slot window, so the paid slot can render", () => {
    const organic = Array.from({ length: 12 }, (_, i) => ({ id: `e${i + 1}` }));
    const feed = interleave(organic, [{ subjectId: "e2" }, { subjectId: "e10" }, { subjectId: "x1" }], [4, 8]);
    expect(feed.flatMap(f => f.kind === "sponsored" ? [f.slot.subjectId] : [])).toEqual(["e10", "x1"]);   // e2 is on screen; e10 is far below
    expect(feed.filter(f => f.kind === "organic").map(f => (f as { item: { id: string } }).item.id)).toEqual(organic.map(o => o.id));
    expect(windowIds(organic, [4, 8])).toEqual(organic.slice(0, 8).map(o => o.id));
    expect(windowIds(organic, [])).toEqual([]);
    const discover = src("src/app/(customer)/discover/page.tsx");
    expect(discover).toContain('serveSponsored("search_results", { ...adCtx, q: s(sp.q) })');
    expect(discover).toContain("windowIds(events, feedPositions)");
    expect(src("src/lib/ads/serve.ts")).toMatch(/q: ctx\.q \? String\(ctx\.q\)\.slice\(0, 80\)/);
  });
  test("every sponsored render is labelled and explains why it is shown; organic cards never claim Sponsored", () => {
    const c = src("src/components/ads/sponsored.tsx");
    expect(c).toContain("Why am I seeing this?");
    expect(c).toMatch(/title=\{AD_WHY\}>Sponsored</);
    expect(c).toMatch(/gd-sp-row-top"><h2 className="gd-sp-row-h">\{title\}<\/h2><AdWhy \/>/);
    expect(c).toMatch(/<\/Link>\s*\{why && <AdWhy \/>\}/);                                // outside the ad link (no nested interactive content)
    expect(src("src/app/(customer)/discover/page.tsx")).toContain("<SponsoredCard s={f.slot} why />");
    expect(src("src/app/organizer/marketplace/page.tsx")).not.toMatch(/l\.sponsored \? "Sponsored"/);
  });
  test("admin can pause a boost and switch placements off (kill switch)", () => {
    const a = src("src/app/admin/(console)/commerce/advertising/actions.ts");
    expect(a).toContain('rpc("adm_boost_pause"'); expect(a).toContain('rpc("adm_ad_placement_set"');
    expect(src("src/app/admin/(console)/commerce/advertising/page.tsx")).toContain('requireAdminPermission("commerce")');
    expect(src("src/app/admin/(console)/commerce/view.tsx")).toContain('href: "/admin/commerce/advertising"');
  });
});

test.describe.configure({ mode: "serial" });
test.describe("Q56 · live DB", () => {
  let owner: { id: string; email: string }, stranger: { id: string; email: string }, ws: string, ev: string, soon: string;
  const city = `q56city${Date.now()}`;
  test.beforeAll(async () => {
    [owner, stranger] = await Promise.all([createUser("q56-owner"), createUser("q56-viewer")]);
    ws = await seedWorkspace(owner.id, "organizer", "Q56 Advertiser");
    const mk = async (name: string, startsIn: number, hours: number, type: string) => ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name, slug: `q56-${randomUUID().slice(0, 8)}`,
      visibility: "public", status: "on_sale", city, event_type: type, starts_at: new Date(Date.now() + startsIn).toISOString(), ends_at: new Date(Date.now() + startsIn + hours * 36e5).toISOString() }, "q56")
      .select("id").single()).data as { id: string }).id;
    ev = await mk("Q56 Supper Club Live", 20 * day, 4, "food_drink");
    soon = await mk("Q56 Soon Show", 2 * day, 3, "comedy");
  });
  test.afterAll(async () => {
    await db.from("promotion_boosts").delete().eq("workspace_id", ws);
    for (const e of [ev, soon]) await db.from("events").delete().eq("id", e);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });

  test("buying: flight ends with the event, retries reuse the open boost, targets are normalised", async () => {
    const c = await signedIn(owner.email) as unknown as SupabaseClient;
    const a = await c.rpc("create_promotion_boost", { p_event: soon, p_product: "featured_event_7d", p_targeting: { cities: [city.toUpperCase()], categories: ["Comedy_Night"] } });
    expect(a.error).toBeNull();
    const b = await c.rpc("create_promotion_boost", { p_event: soon, p_product: "featured_event_7d", p_targeting: { cities: [city] } });
    expect(b.data).toBe(a.data);                                                    // abandoned checkout → same pending boost
    const row = (await db.from("promotion_boosts").select("ends_at,targeting").eq("id", a.data as string).single()).data as { ends_at: string; targeting: { cities: string[]; categories: string[] } };
    const evEnd = (await db.from("events").select("ends_at").eq("id", soon).single()).data as { ends_at: string };
    expect(Date.parse(row.ends_at)).toBe(Date.parse(evEnd.ends_at));               // 7-day product, 2-day event → ends with the event
    expect(row.targeting).toEqual({ cities: [city], categories: [] });
  });

  test("matching, self-impressions and the paid view: own team never billed, a stranger is", async () => {
    const { data: boost, error } = await db.from("promotion_boosts").insert({ workspace_id: ws, event_id: ev, product_key: "category_spotlight_7d", placement: "category",
      amount_minor: 2900, status: "active", targeting: {}, starts_at: new Date(Date.now() - 36e5).toISOString(), ends_at: new Date(Date.now() + 5 * day).toISOString() }).select("id").single();
    expect(error).toBeNull();
    const id = (boost as { id: string }).id;
    const cands = async (ctx: Record<string, string>) => (((await db.rpc("ad_candidates", { p_placement: "category_top", p_ctx: ctx, p_now: new Date().toISOString(), p_exclude: [] })).data ?? []) as { boost_id: string }[]).map(r => r.boost_id);
    expect(await cands({ category: "food" })).toContain(id);                        // chip "food" ~ event type food_drink
    expect(await cands({ category: "wedding" })).not.toContain(id);
    expect(await cands({ city })).toContain(id);
    expect(await cands({ city: "elsewhere-q56" })).not.toContain(id);
    const serve = async (user: string) => (((await db.rpc("serve_ad_slots", { p_placement: "category_top", p_user: user, p_anon: null, p_ctx: { category: "food" }, p_exclude: [], p_seed: randomUUID() })).data ?? []) as { token: string; boost_id: string }[]).find(s => s.boost_id === id);
    const mine = await serve(owner.id); expect(mine).toBeTruthy();
    expect((await db.rpc("record_ad_view", { p_token: mine!.token, p_user: owner.id, p_anon: null })).data).toBe(false);
    expect(((await db.rpc("record_ad_click", { p_token: mine!.token, p_user: owner.id, p_anon: null })).data as { counted: boolean }).counted).toBe(false);
    const theirs = await serve(stranger.id); expect(theirs).toBeTruthy();
    expect((await db.rpc("record_ad_view", { p_token: theirs!.token, p_user: stranger.id, p_anon: null })).data).toBe(true);
    const after = (await db.from("promotion_boosts").select("delivered_impressions,delivered_clicks").eq("id", id).single()).data as { delivered_impressions: number; delivered_clicks: number };
    expect(after).toEqual({ delivered_impressions: 1, delivered_clicks: 0 });
    // Paused → never served.
    await db.from("promotion_boosts").update({ paused_at: new Date().toISOString() }).eq("id", id);
    expect(await cands({ category: "food" })).not.toContain(id);
    await db.from("promotion_boosts").update({ paused_at: null }).eq("id", id);
  });

  test("admin and worker functions are not callable by clients", async () => {
    const c = await signedIn(stranger.email) as unknown as SupabaseClient;
    expect((await c.rpc("adm_boost_pause", { p_boost: randomUUID(), p_pause: true, p_reason: "policy test" })).error?.message).toMatch(/not_authorized/);
    expect((await c.rpc("adm_ad_placement_set", { p_key: "*", p_active: false, p_reason: "kill test" })).error?.message).toMatch(/not_authorized/);
    const a = anon() as unknown as SupabaseClient;
    for (const [fn, args] of [["ad_credit_refunds_due", { p_livemode: false }], ["ad_credit_refund_result", { p_ledger: randomUUID(), p_refund: "re_x", p_amount: 1, p_error: null }],
      ["ad_is_advertiser", { p_workspace: ws, p_user: owner.id }], ["adm_boost_pause", { p_boost: randomUUID(), p_pause: true, p_reason: "x" }]] as const)
      expect((await a.rpc(fn, args)).error, fn).not.toBeNull();
    expect((await c.rpc("ad_credit_refunds_due", { p_livemode: false })).error).not.toBeNull();
  });
});
