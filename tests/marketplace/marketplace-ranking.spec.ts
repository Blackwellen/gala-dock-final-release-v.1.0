import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, enrolTotp, seedWorkspace, signedIn } from "../phase1/helpers";

// Q09 Marketplace listings / search / ranking (domains 103–107; migrations 202610291031–1033). Exit gate: ranking reasons can be
// explained (internally) and sponsored results are labelled. Owner 2026-10-29: reasons/scores/model version never reach the
// public or customers — marketplace_search is lean; marketplace_search_explained is workspace-permission or platform-admin only. API level with disposable identities; listings live in a private test city.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
type Reason = { feature: string; value: number; weight: number; contribution: number; text: string };
type Hit = { listing_id: string; name: string; score: number; availability: string; reliability_band: string; model_version: number; ranking_reasons: Reason[]; packages: { name: string; price_minor: number }[]; estimate_minor: number | null };
type Res = { model_version: number; total: number; results: Hit[]; excluded_inputs: string[]; organic_only: boolean };
const INTERNAL = ["score", "ranking_reasons", "model_version"];
const expectLean = (r: { results: object[] } & object) => {
  expect("model_version" in r).toBe(false);
  expect("excluded_inputs" in r).toBe(false);
  for (const h of r.results) for (const k of INTERNAL) expect(k in h).toBe(false);
};
const CITY = `Q09ville${Date.now() % 100000}`;

test.describe.configure({ mode: "serial" });
test.describe("Q09 marketplace ranking", () => {
  let oA: { id: string; email: string }, oB: { id: string; email: string }, oC: { id: string; email: string }, cust: { id: string; email: string }, stranger: { id: string; email: string };
  let A: string, B: string, Cw: string, grand: string, small: string, loft: string, djL: string, event: string;
  let custC: SupabaseClient, strangerC: SupabaseClient, orgC: SupabaseClient, admC: SupabaseClient;
  let orgU: { id: string; email: string }, admU: { id: string; email: string }, OW: string, orgEvent: string;
  const day = at(45, 17), dayEnd = at(45, 23);
  const wss: string[] = [];
  const search = async (c: SupabaseClient, p: Record<string, unknown>) => { const r = await c.rpc("marketplace_search", { p: { city: CITY, ...p } }); expect(r.error).toBeNull(); expectLean(r.data as Res); return r.data as Res; };
  // Internal explainability (organizer workspace with marketplace.request, provider with listings.manage, or platform admin).
  const explain = async (p: Record<string, unknown>, c?: SupabaseClient, ws: string | null = OW) => {
    const r = await (c ?? orgC).rpc("marketplace_search_explained", { p: { city: CITY, ...p }, p_workspace: ws }); expect(r.error).toBeNull(); return r.data as Res; };

  test.beforeAll(async () => {
    [oA, oB, oC, cust, stranger] = await Promise.all(["q09-a", "q09-b", "q09-c", "q09-cust", "q09-x"].map(l => createUser(l)));
    [A, B, Cw] = await Promise.all([seedWorkspace(oA.id, "provider", "Q09 Test Venues A"), seedWorkspace(oB.id, "provider", "Q09 Test Venues B"), seedWorkspace(oC.id, "provider", "Q09 Test DJ Co")]);
    wss.push(A, B, Cw);
    await db.from("workspaces").update({ capabilities: ["service"] }).eq("id", Cw);
    const listing = async (ws: string, row: Record<string, unknown>) => (await one(db.from("listings").insert({ workspace_id: ws, published: true, city: CITY, location: `${CITY}, UK`, ...row }).select("id").single())).id;
    grand = await listing(A, { name: "Q09 Test Grand Hall", kind: "venue", category: "venue", capacity_max: 200, price_from: 1000, price_unit: "per event", rating: 4.8, review_count: 40, response_hours: 2, verified: true });
    small = await listing(B, { name: "Q09 Test Small Room", kind: "venue", category: "venue", capacity_max: 30, price_from: 300, price_unit: "per event", rating: 4.9, review_count: 2, response_hours: 48 });
    loft = await listing(B, { name: "Q09 Test Loft", kind: "venue", category: "venue", capacity_max: 150, price_from: 1500, price_unit: "per event", rating: 4.5, review_count: 10, response_hours: 4 });
    djL = await listing(Cw, { name: "Q09 Test DJ", kind: "service", category: "dj", price_from: 500, price_unit: "per event", rating: 4.7, review_count: 12, response_hours: 1 });
    await db.from("packages").insert({ workspace_id: Cw, listing_id: djL, name: "Q09 Party Set", status: "published", base_price: 600, price_basis: "fixed", min_guests: 10, max_guests: 300 });
    // The Grand Hall is closed on the requested evening (availability block — one of the Q10 conflict sources).
    await db.from("availability_blocks").insert({ workspace_id: A, listing_id: grand, kind: "blocked", note: "private", starts_at: at(45, 12), ends_at: at(46, 2) });
    event = (await one(db.from("events").insert({ owner_id: cust.id, name: "Q09 Test birthday", event_type: "birthday", priorities: ["entertainment"], city: CITY, guest_count: 100, budget_total: 5000, starts_at: day, ends_at: dayEnd }).select("id").single())).id;
    [orgU, admU] = await Promise.all([createUser("q09-org"), createUser("q09-adm")]);
    OW = await seedWorkspace(orgU.id, "organizer", "Q09 Test Organizer");
    wss.push(OW);
    await db.from("platform_admins").insert({ user_id: admU.id, title: "Q09 test admin", permissions: ["marketplace"] });
    orgEvent = (await one(db.from("events").insert({ owner_id: orgU.id, workspace_id: OW, name: "Q09 Test org gala", event_type: "birthday", city: CITY, guest_count: 100, budget_total: 5000, starts_at: day, ends_at: dayEnd }).select("id").single())).id;
    [custC, strangerC, orgC, admC] = await Promise.all([cust, stranger, orgU, admU].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
    await enrolTotp(admC as never);   // Q45 (migration 202610293034): platform-admin reads need an aal2 session too
  });
  test.afterAll(async () => {
    await db.from("marketplace_match_runs").delete().eq("event_id", event);
    await db.from("build_suggestion_feedback").delete().eq("event_id", event);
    await db.from("build_items").delete().eq("event_id", event);
    await db.from("marketplace_match_runs").delete().eq("event_id", orgEvent);
    await db.from("events").delete().in("id", [event, orgEvent]);
    await db.from("platform_admins").delete().eq("user_id", admU.id);
    for (const ws of wss) { await db.from("reliability_snapshots").delete().eq("workspace_id", ws); await db.from("availability_blocks").delete().eq("workspace_id", ws); await db.from("packages").delete().eq("workspace_id", ws); await db.from("listings").delete().eq("workspace_id", ws); await db.from("workspaces").delete().eq("id", ws); }
    await cleanup();
  });

  test("hard filters: kind, location, capacity, price, packages", async () => {
    const all = await search(custC, { kind: "venue" });
    expect(all.results.map(r => r.name).sort()).toEqual(["Q09 Test Grand Hall", "Q09 Test Loft", "Q09 Test Small Room"]);
    expect((await search(custC, { kind: "venue", guests: 100 })).results.map(r => r.name).sort()).toEqual(["Q09 Test Grand Hall", "Q09 Test Loft"]);
    expect((await search(custC, { kind: "venue", guests: 100, max_price: 1200 })).results.map(r => r.name)).toEqual(["Q09 Test Grand Hall"]);
    expect((await search(custC, { kind: "venue", min_price: 1200 })).results.map(r => r.name)).toEqual(["Q09 Test Loft"]);
    // "Verified" is the Q08 trust badge (a self-asserted flag is reset by its guard), so none of these fresh listings qualify.
    expect((await search(custC, { verified: true })).results).toEqual([]);
    const pk = await search(custC, { has_package: true, guests: 50 });
    expect(pk.results.map(r => r.name)).toEqual(["Q09 Test DJ"]);
    expect(pk.results[0]!.packages).toMatchObject([{ name: "Q09 Party Set", price_minor: 60000 }]);
    expect((await search(custC, { category: "entertainment" })).results.map(r => r.name)).toEqual(["Q09 Test DJ"]);
    expect((await search(custC, { q: "loft" })).results.map(r => r.name)).toEqual(["Q09 Test Loft"]);
  });

  test("date/availability: an unavailable listing ranks with availability 0 or is filtered out", async () => {
    const ranked = await explain({ kind: "venue", guests: 100, starts_at: day, ends_at: dayEnd });
    const g = ranked.results.find(r => r.listing_id === grand)!, l = ranked.results.find(r => r.listing_id === loft)!;
    expect(g.availability).toBe("unavailable");
    expect(g.ranking_reasons.find(r => r.feature === "availability")).toMatchObject({ value: 0, text: "Unavailable on your date" });
    expect(l.availability).toBe("available");
    expect(ranked.results[0]!.listing_id).toBe(loft);                                  // the free venue outranks the better-rated closed one
    const excl = await search(custC, { kind: "venue", guests: 100, starts_at: day, ends_at: dayEnd, availability: "exclude" });
    expect(excl.results.map(r => r.listing_id)).toEqual([loft]);
    // Another evening: the Grand Hall is open again and its rating/verification put it first.
    expect((await search(custC, { kind: "venue", guests: 100, starts_at: at(52, 17), ends_at: at(52, 23) })).results[0]!.listing_id).toBe(grand);
  });

  test("reasons are internal: anon/customer get lean ordered results; explain needs the workspace permission or admin", async () => {
    const p = { q: "hall", kind: "venue", starts_at: at(52, 17), ends_at: at(52, 23), budget: 1200 };
    const lean = await search(custC, p);                                                   // asserts no score/reasons/model version
    const full = await explain(p);
    expect(lean.results.map(r => r.listing_id)).toEqual(full.results.map(r => r.listing_id)); // same organic order
    expect((await (anon() as unknown as SupabaseClient).rpc("marketplace_search", { p: { city: CITY } })).error).not.toBeNull();
    expect((await (anon() as unknown as SupabaseClient).rpc("marketplace_search_explained", { p: { city: CITY } })).error).not.toBeNull();
    expect((await custC.rpc("marketplace_search_explained", { p: { city: CITY }, p_workspace: null })).error?.message).toMatch(/not_authorized/);
    expect((await custC.rpc("marketplace_search_explained", { p: { city: CITY }, p_workspace: OW })).error?.message).toMatch(/not_authorized/); // not a member
    expect((await custC.rpc("marketplace_search_ranked", { p: { city: CITY } })).error).not.toBeNull();             // service-only
    const adm = await explain(p, admC, null);                                              // platform admin (marketplace permission)
    expect(adm.results[0]!.ranking_reasons.length).toBeGreaterThan(0);
    // A provider owner may explain within their own workspace (listings.manage), not another one.
    const provC = await signedIn(oA.email) as unknown as SupabaseClient;
    expect((await explain({ kind: "venue" }, provC, A)).results.length).toBeGreaterThan(0);
    expect((await provC.rpc("marketplace_search_explained", { p: { city: CITY }, p_workspace: OW })).error?.message).toMatch(/not_authorized/);
  });

  test("EXIT GATE (1): every score is explained by its versioned ranking reasons (internal explain path)", async () => {
    const r = await explain({ q: "hall", kind: "venue", starts_at: at(52, 17), ends_at: at(52, 23), budget: 1200 });
    expect(r.model_version).toBe(1);
    const model = await one<{ weights: Record<string, number> }>(custC.from("ranking_models").select("weights").eq("version", 1).single());
    for (const h of r.results) {
      expect(h.model_version).toBe(1);
      const feats = h.ranking_reasons.map(x => x.feature).sort();
      expect(feats).toEqual(["availability", "budget", "distance", "rating", "reliability", "response", "text"]);
      for (const x of h.ranking_reasons) { expect(x.weight).toBe(model.weights[x.feature]); expect(x.text.length).toBeGreaterThan(3); expect(x.value).toBeGreaterThanOrEqual(0); expect(x.value).toBeLessThanOrEqual(1); }
      const sum = h.ranking_reasons.reduce((s, x) => s + x.contribution, 0);
      expect(Math.abs(sum - h.score)).toBeLessThan(0.1);
      const den = h.ranking_reasons.reduce((s, x) => s + x.weight, 0), num = h.ranking_reasons.reduce((s, x) => s + x.value * x.weight, 0);
      expect(Math.abs(100 * num / den - h.score)).toBeLessThan(0.02);
    }
    // Features without input are omitted (no query, no date, no budget) and the weights renormalise.
    const bare = (await explain({ kind: "venue" })).results[0]!;
    expect(bare.ranking_reasons.map(x => x.feature).sort()).toEqual(["distance", "rating", "reliability", "response"]);
    // The model version is immutable.
    expect((await db.from("ranking_models").update({ weights: { text: 1 } }).eq("version", 1)).error?.message).toMatch(/ranking_model_immutable/);
  });

  test("reliability weighting uses the Q08 band (read only) and is visible in the reasons", async () => {
    const base = (await explain({ kind: "venue", guests: 100 })).results;
    const before = base.find(r => r.listing_id === loft)!;
    await db.from("reliability_snapshots").insert({ workspace_id: B, formula_version: 1, score: 92, band: "excellent", components: {} });
    const after = (await explain({ kind: "venue", guests: 100 })).results.find(r => r.listing_id === loft)!;
    expect(after.reliability_band).toBe("excellent");
    expect(after.ranking_reasons.find(r => r.feature === "reliability")).toMatchObject({ value: 1, text: "Reliability: excellent" });
    expect(after.score).toBeGreaterThan(before.score);
    await db.from("reliability_snapshots").insert({ workspace_id: B, formula_version: 1, score: 30, band: "at_risk", components: {} });
    expect((await explain({ kind: "venue", guests: 100 })).results.find(r => r.listing_id === loft)!.score).toBeLessThan(before.score);
  });

  test("EXIT GATE (2): sponsorship never changes organic scores; sponsored results are separate and labelled", async () => {
    const before = await explain({ kind: "venue" });
    await db.from("listings").update({ sponsored: true }).eq("id", small);
    const after = await explain({ kind: "venue" });
    expect(after.results.map(r => [r.listing_id, r.score])).toEqual(before.results.map(r => [r.listing_id, r.score]));
    expect(after.excluded_inputs).toEqual(expect.arrayContaining(["sponsored", "promotion_boosts"]));
    expect(after.results.every(r => !("sponsored" in r))).toBe(true);
    await db.from("listings").update({ sponsored: false }).eq("id", small);
    // Public API: organic results carry no reasons/score/model version; any sponsored slot is in its own labelled array.
    const res = await fetch(`${BASE}/api/public/marketplace?city=${CITY}&kind=venue&guests=100&date=${day.slice(0, 10)}`);
    expect(res.status).toBe(200);
    const body = await res.json() as Res & { sponsored: { sponsored: boolean; label: string; rel: string }[] };
    expect(body.organic_only).toBe(true);
    expect(body.results.length).toBe(2);
    expectLean(body);
    expect(Array.isArray(body.sponsored)).toBe(true);
    for (const s of body.sponsored) { expect(s).toMatchObject({ sponsored: true, label: "Sponsored", rel: "sponsored nofollow" }); expect("ranking_reasons" in s).toBe(false); }
    expect((await fetch(`${BASE}/api/public/marketplace?kind=castle`)).status).toBe(400);
  });

  test("matching: requirements → candidates; reasons persisted for the event team only, never shown to customers", async () => {
    const r = await custC.rpc("marketplace_match", { p_event: event, p_category: "venue", p_limit: 5 });
    expect(r.error).toBeNull();
    const m = r.data as Res & { match_run_id: string; requirements: Record<string, unknown> };
    expect(m.requirements).toMatchObject({ kind: "venue", category: "venue", guests: 100, availability: "exclude" });
    expect(Number(m.requirements.budget)).toBeGreaterThan(0);                           // venue share of the £5,000 budget
    expect(m.results.map(x => x.listing_id)).toEqual([loft]);                            // too small and closed venues are filtered
    expectLean(m);                                                                       // customer event: no reasons/score
    expect((await custC.from("marketplace_match_runs").select("id").eq("event_id", event)).data).toHaveLength(0); // features stay internal
    // Organizer event team (marketplace.request): the same match is explained and its persisted run is readable.
    const o = (await orgC.rpc("marketplace_match", { p_event: orgEvent, p_category: "venue", p_limit: 5 })).data as Res & { match_run_id: string };
    expect(o.model_version).toBe(1);
    expect(o.results[0]!.ranking_reasons.length).toBeGreaterThan(3);
    const run = await one<{ results: { listing_id: string; ranking_reasons: Reason[] }[]; model_version: number }>(orgC.from("marketplace_match_runs").select("results,model_version").eq("id", o.match_run_id).single());
    expect(run.model_version).toBe(1);
    expect(run.results[0]!.ranking_reasons.length).toBeGreaterThan(3);
    expect((await strangerC.from("marketplace_match_runs").select("id").eq("event_id", event)).data).toHaveLength(0);
    expect((await strangerC.rpc("marketplace_match", { p_event: event, p_category: "venue" })).error?.message).toMatch(/not_authorized/);
    // A listing already in the build is not matched again.
    await custC.from("build_items").insert({ event_id: event, listing_id: loft, category: "venue", title: "Q09 Test Loft", status: "suggested" });
    expect(((await custC.rpc("marketplace_match", { p_event: event, p_category: "venue" })).data as Res).results).toHaveLength(0);
  });

  test("recommendations: eligible only, non-personalised, dismissible; backups from another provider; similar providers", async () => {
    const ev = (await custC.rpc("marketplace_recommendations", { p_mode: "event", p_id: event, p_limit: 3 })).data as { kind: string; category: string; results: Hit[] }[];
    const ent = ev.find(x => x.category === "entertainment");
    expect(ent?.kind).toBe("supplier_suggestion");
    expect(ent?.results.map(x => x.listing_id)).toEqual([djL]);
    for (const g of ev) expectLean(g as unknown as { results: object[] });
    expect(ev.find(x => x.category === "venue")).toBeUndefined();                        // venue already chosen
    await custC.rpc("build_suggestion_feedback_set", { p_event: event, p_listing: djL, p_action: "dismissed" });
    const again = (await custC.rpc("marketplace_recommendations", { p_mode: "event", p_id: event, p_limit: 3 })).data as { category: string; results: Hit[] }[];
    expect(again.find(x => x.category === "entertainment")?.results).toEqual([]);
    const venueLine = await one(db.from("build_items").select("id").eq("event_id", event).eq("listing_id", loft).single());
    const backup = (await custC.rpc("marketplace_recommendations", { p_mode: "backup", p_id: venueLine.id, p_limit: 3 })).data as { kind: string; results: Hit[] }[];
    expect(backup[0]!.kind).toBe("backup_suggestion");
    expect(backup[0]!.results.map(x => x.listing_id)).not.toContain(small);              // same provider (B) and too small
    const similar = (await strangerC.rpc("marketplace_recommendations", { p_mode: "similar", p_id: loft, p_limit: 5 })).data as { results: Hit[] }[];
    expect(similar[0]!.results.map(x => x.listing_id)).toEqual([grand]);                // other providers only (B's small room excluded)
    expect((await strangerC.rpc("marketplace_recommendations", { p_mode: "event", p_id: event })).error?.message).toMatch(/not_authorized/);
  });

  test("public category/location discovery (W01 /events/<city>) is service-only behind the public API", async () => {
    const d = (await db.rpc("public_discover", { p_city: CITY.toLowerCase(), p_category: null, p_types: null, p_from: null, p_to: null, p_limit: 20, p_offset: 0 })).data as { total: number; results: { doc_id: string; doc_type: string }[]; facets: { category: string; count: number }[] };
    expect(d.results.map(x => x.doc_id).sort()).toEqual([grand, small, loft, djL].sort());
    expect(d.facets.length).toBeGreaterThan(0);
    const dj = (await db.rpc("public_discover", { p_city: CITY, p_category: "dj", p_types: null, p_from: null, p_to: null, p_limit: 20, p_offset: 0 })).data as { results: { doc_id: string }[] };
    expect(dj.results.map(x => x.doc_id)).toEqual([djL]);
    expect((await (anon() as unknown as SupabaseClient).rpc("public_discover", { p_city: CITY })).error).not.toBeNull();
    expect((await custC.rpc("public_discover", { p_city: CITY })).error).not.toBeNull();
    const api = await fetch(`${BASE}/api/public/discover?city=${CITY.toLowerCase()}&type=venue`);
    expect(api.status).toBe(200);
    expect(((await api.json()) as { results: unknown[] }).results).toHaveLength(3);
    // Unpublishing removes a listing from discovery and marketplace search immediately.
    await db.from("listings").update({ published: false }).eq("id", small);
    expect(((await db.rpc("public_discover", { p_city: CITY, p_category: null, p_types: ["venue"], p_from: null, p_to: null, p_limit: 20, p_offset: 0 })).data as { results: unknown[] }).results).toHaveLength(2);
    expect((await search(custC, { kind: "venue" })).results.map(r => r.listing_id)).not.toContain(small);
  });
});
