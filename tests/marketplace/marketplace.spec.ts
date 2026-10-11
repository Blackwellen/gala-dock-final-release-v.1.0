import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Phase 3 marketplace lifecycle (§33–37, §44–45) against the live project, through RLS-bound user clients.
type Id = { id: string };
const db = admin as unknown as SupabaseClient;
const rpc = async (c: SupabaseClient, fn: string, args: Record<string, unknown>) => (c as unknown as SupabaseClient).rpc(fn, args);
const day = 864e5;

test.describe.configure({ mode: "serial" });
test.describe("marketplace lifecycle", () => {
  let org: { id: string; email: string }, prov: { id: string; email: string }, prov2: { id: string; email: string }, out: { id: string; email: string }, adm: { id: string; email: string };
  let orgC: SupabaseClient, provC: SupabaseClient, prov2C: SupabaseClient, outC: SupabaseClient, admC: SupabaseClient;
  let provWs: string, prov2Ws: string, listing: string, venueListing: string, farListing: string, event: string;

  const item = async (status: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await db.from("build_items").insert({ event_id: event, listing_id: listing, category: "dj", title: "Test DJ", status, amount: 1000, ...extra }).select("id").single();
    if (error) throw error;
    return (data as Id).id;
  };

  test.beforeAll(async () => {
    [org, prov, prov2, out, adm] = await Promise.all([createUser("m-org"), createUser("m-prov"), createUser("m-prov2"), createUser("m-out"), createUser("m-admin")]);
    provWs = await seedWorkspace(prov.id, "provider", "Sweep DJs");
    prov2Ws = await seedWorkspace(prov2.id, "provider", "Far DJs");
    const L = async (ws: string, name: string, extra: Record<string, unknown>) => ((await db.from("listings").insert({ workspace_id: ws, name, kind: "service", category: "dj", published: true, response_hours: 4, lat: 51.5, lng: -0.12, ...extra }).select("id").single()).data as Id).id;
    listing = await L(provWs, "Test DJ", { emergency_supply: true });
    venueListing = await L(provWs, "Test Hall", { kind: "venue", category: "venue" });
    farListing = await L(prov2Ws, "Far DJ", { emergency_supply: true, lat: 55.95, lng: -3.19 }); // Edinburgh — out of a 40km London radius
    event = ((await db.from("events").insert({ owner_id: org.id, name: "Marketplace test", starts_at: new Date(Date.now() + 20 * day).toISOString(), venue_listing_id: venueListing }).select("id").single()).data as Id).id;
    await db.from("platform_admins").insert({ user_id: adm.id, title: "Test admin", permissions: ["support", "marketplace", "commerce"] });
    [orgC, provC, prov2C, outC, admC] = await Promise.all([org, prov, prov2, out, adm].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  // Disputes/cancellations are restrict-FK records, so they go first; workspaces must go before their owners can be deleted.
  test.afterAll(async () => {
    const wss = [provWs, prov2Ws];
    for (const t of ["booking_disputes", "booking_cancellations"]) await db.from(t).delete().eq("event_id", event);
    await db.from("provider_jobs").delete().in("workspace_id", wss);
    await db.from("events").delete().eq("id", event);
    await db.from("workspaces").delete().in("id", wss);
    await db.from("platform_admins").delete().eq("user_id", adm.id);
    await cleanup();
  });

  test("§34 response commitment: deadline from provider window, responded vs expired (not declined)", async () => {
    const a = await item("sent");
    const { data: row } = await db.from("build_items").select("sent_at,response_deadline,response_status").eq("id", a).single();
    const r = row as { sent_at: string; response_deadline: string; response_status: string };
    expect(r.response_status).toBe("pending");
    expect(Math.round((Date.parse(r.response_deadline) - Date.parse(r.sent_at)) / 36e5)).toBe(4);
    expect((await rpc(provC, "provider_respond", { p_item: a, p_response: "available", p_note: "" })).error).toBeNull();
    expect(((await db.from("build_items").select("response_status,responded_at").eq("id", a).single()).data as { response_status: string }).response_status).toBe("responded");

    const b = await item("sent");
    await db.from("build_items").update({ response_deadline: new Date(Date.now() - 6e4).toISOString() }).eq("id", b);
    expect((await rpc(db, "marketplace_sweep", {})).error).toBeNull();
    const after = (await db.from("build_items").select("status,response_status").eq("id", b).single()).data as { status: string; response_status: string };
    expect(after).toEqual({ status: "expired", response_status: "expired" });
    // Users cannot run the sweep.
    expect((await rpc(orgC, "marketplace_sweep", {})).error).not.toBeNull();
  });

  test("§35 conditional hold with dependency: request → accept → dependency met → release", async () => {
    const venue = ((await db.from("build_items").insert({ event_id: event, listing_id: venueListing, category: "venue", title: "Hall", status: "quoted", amount: 3000 }).select("id").single()).data as Id).id;
    const dj = await item("available");
    expect((await rpc(outC, "request_conditional_hold", { p_item: dj, p_hours: 72, p_depends_on: venue, p_conditions: "" })).error?.message).toMatch(/not_authorized/);
    const { data: hold, error } = await rpc(orgC, "request_conditional_hold", { p_item: dj, p_hours: 72, p_depends_on: venue, p_conditions: "Only if the hall confirms" });
    expect(error).toBeNull();
    expect(((await db.from("build_items").select("status").eq("id", dj).single()).data as { status: string }).status).toBe("conditional_hold_requested");
    // Another provider cannot answer it; the right provider accepts for a shorter window.
    expect((await rpc(prov2C, "provider_respond_hold", { p_hold: hold, p_accept: true, p_hours: 48, p_note: "" })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(provC, "provider_respond_hold", { p_hold: hold, p_accept: true, p_hours: 48, p_note: "Held" })).error).toBeNull();
    const h = (await orgC.from("conditional_holds").select("status,expires_at,dependency_state").eq("id", hold as string).single()).data as { status: string; expires_at: string; dependency_state: string };
    expect(h.status).toBe("held");
    expect(h.dependency_state).toBe("pending");
    expect(Math.round((Date.parse(h.expires_at) - Date.now()) / 36e5)).toBe(48);
    // Enforced machine: a held hold cannot go back to requested.
    expect((await db.from("conditional_holds").update({ status: "requested" }).eq("id", hold as string)).error?.message).toMatch(/illegal conditional_hold transition/);
    await db.from("build_items").update({ status: "confirmed" }).eq("id", venue);
    expect(((await db.from("conditional_holds").select("dependency_state").eq("id", hold as string).single()).data as { dependency_state: string }).dependency_state).toBe("met");
    expect((await rpc(orgC, "release_conditional_hold", { p_hold: hold, p_reason: "Went another way" })).error).toBeNull();
    expect(((await db.from("build_items").select("status").eq("id", dj).single()).data as { status: string }).status).toBe("available");
    // Outsiders cannot read holds.
    expect((await outC.from("conditional_holds").select("id").eq("id", hold as string)).data).toEqual([]);
  });

  test("§36 paid standby: offer → accept (fee due) → activation blocked until paid → activate", async () => {
    const primary = await item("confirmed");
    const sb = await item("available");
    const start = new Date(Date.now() + 19 * day).toISOString(), end = new Date(Date.now() + 21 * day).toISOString();
    const { data: sid, error } = await rpc(orgC, "request_standby", { p_item: sb, p_primary: primary, p_window_start: start, p_window_end: end, p_note: "Cover for headliner" });
    expect(error).toBeNull();
    expect((await rpc(provC, "provider_offer_standby", { p_standby: sid, p_fee: 150, p_activation_price: 900, p_valid_hours: 48, p_terms: "Standby fee is non-refundable once accepted." })).error).toBeNull();
    expect((await rpc(outC, "accept_standby", { p_standby: sid })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(orgC, "accept_standby", { p_standby: sid })).data).toBe("fee_due");
    expect((await rpc(orgC, "activate_standby", { p_standby: sid, p_reason: "Headliner ill" })).error?.message).toMatch(/standby_fee_unpaid/);
    await db.from("standby_commitments").update({ fee_status: "paid" }).eq("id", sid as string); // settled by payment orchestration
    await db.from("build_items").update({ status: "cancelled_by_provider" }).eq("id", primary); // primary fails → standby surfaced
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", org.id).like("title", "Standby ready:%");
    expect(count).toBeGreaterThan(0);
    expect((await rpc(orgC, "activate_standby", { p_standby: sid, p_reason: "Headliner ill" })).error).toBeNull();
    const b = (await db.from("build_items").select("status,amount,role").eq("id", sb).single()).data as { status: string; amount: number; role: string };
    expect(b).toEqual({ status: "confirmed", amount: 900, role: "primary" });
  });

  test("§37 emergency supply: controlled pool, quote, accept", async () => {
    await rpc(provC, "save_emergency_profile", { p_ws: provWs, p: { enabled: true, categories: ["dj"], radius_km: 40, response_minutes: 30, available_now: true } });
    await rpc(prov2C, "save_emergency_profile", { p_ws: prov2Ws, p: { enabled: true, categories: ["dj"], radius_km: 40, response_minutes: 30, available_now: true } });
    const { data: rid, error } = await rpc(orgC, "create_emergency_request", { p_event: event, p: { severity: "critical", category: "dj", required_arrival: new Date(Date.now() + 3 * 36e5).toISOString(), lat: 51.51, lng: -0.11, scope: "4 hour set", failure_reason: "DJ no-show" } });
    expect(error).toBeNull();
    const cands = (await orgC.from("emergency_candidates").select("id,workspace_id,distance_km").eq("request_id", rid as string)).data as { id: string; workspace_id: string }[];
    expect(cands.map(c => c.workspace_id)).toEqual([provWs]); // far provider excluded by radius
    expect((await prov2C.from("emergency_requests").select("id").eq("id", rid as string)).data).toEqual([]);
    const cid = cands[0].id;
    expect((await rpc(orgC, "accept_emergency_candidate", { p_candidate: cid })).error?.message).toMatch(/not_quoted/);
    expect((await rpc(provC, "provider_emergency_respond", { p_candidate: cid, p_action: "quote", p_quote: 650, p_eta: 45, p_note: "On my way" })).error).toBeNull();
    const { data: bid, error: e2 } = await rpc(orgC, "accept_emergency_candidate", { p_candidate: cid });
    expect(e2).toBeNull();
    expect(((await db.from("build_items").select("status,amount").eq("id", bid as string).single()).data as { status: string }).status).toBe("quoted");
    expect(((await db.from("emergency_requests").select("status").eq("id", rid as string).single()).data as { status: string }).status).toBe("filled");
  });

  test("§45 cancellation engine: policy tiers, manual review without policy, provider cancellation consequences", async () => {
    const policy = { tiers: [{ days_before: 30, refund_pct: 100 }, { days_before: 14, refund_pct: 50 }, { days_before: 0, refund_pct: 0 }], deposit_refundable: true, nonrecoverable: 0 };
    const withPolicy = await item("confirmed", { deposit: 400, terms_snapshot: { cancellation: policy } });
    const { data: q } = await rpc(orgC, "cancellation_quote", { p_item: withPolicy, p_party: "customer", p_kind: "full" });
    expect((q as { refund_pct: number; refund_amount: number })).toMatchObject({ refund_pct: 50, refund_amount: 200 }); // 20 days out, £400 paid
    const { error } = await rpc(orgC, "request_cancellation", { p_item: withPolicy, p_party: "customer", p_kind: "full", p_reason: "Event postponed indefinitely" });
    expect(error).toBeNull();
    expect(((await db.from("build_items").select("status").eq("id", withPolicy).single()).data as { status: string }).status).toBe("cancelled_by_customer");

    const noPolicy = await item("confirmed", { deposit: 300 });
    const { data: cid } = await rpc(orgC, "request_cancellation", { p_item: noPolicy, p_party: "customer", p_kind: "full", p_reason: "Budget cut by client" });
    const c = (await db.from("booking_cancellations").select("status,requires_review").eq("id", cid as string).single()).data as { status: string; requires_review: boolean };
    expect(c).toEqual({ status: "manual_review", requires_review: true });
    expect((await rpc(orgC, "decide_cancellation", { p_cancellation: cid, p_accept: true, p_note: "", p_refund: 300 })).error?.message).toMatch(/admin_review_required/);
    expect((await rpc(admC, "decide_cancellation", { p_cancellation: cid, p_accept: true, p_note: "Goodwill full refund", p_refund: 300 })).error).toBeNull();

    const provCancel = await item("confirmed", { deposit: 250 });
    expect((await rpc(provC, "request_cancellation", { p_item: provCancel, p_party: "customer", p_kind: "full", p_reason: "Pretending to be the customer" })).error?.message).toMatch(/invalid_party/);
    expect((await rpc(provC, "request_cancellation", { p_item: provCancel, p_party: "provider", p_kind: "full", p_reason: "Double booked by mistake" })).error).toBeNull();
    expect(((await db.from("build_items").select("status").eq("id", provCancel).single()).data as { status: string }).status).toBe("replacement_required");
    const rel = (await db.from("reliability_metrics").select("provider_cancellations").eq("workspace_id", provWs).single()).data as { provider_cancellations: number };
    expect(rel.provider_cancellations).toBe(1);
  });

  test("§44 booking dispute: open, evidence, admin proposal, both accept → resolved", async () => {
    const it = await item("fulfilled");
    expect((await rpc(outC, "open_booking_dispute", { p_item: it, p_reason: "late_arrival", p_summary: "Arrived two hours late", p_amount: 200 })).error?.message).toMatch(/not_authorized/);
    const { data: did, error } = await rpc(orgC, "open_booking_dispute", { p_item: it, p_reason: "late_arrival", p_summary: "Arrived two hours late and missed the first dance", p_amount: 200 });
    expect(error).toBeNull();
    expect(((await db.from("build_items").select("status").eq("id", it).single()).data as { status: string }).status).toBe("disputed");
    await rpc(orgC, "add_dispute_entry", { p_dispute: did, p_kind: "evidence", p_body: "Timeline attached", p_files: [] });
    await rpc(provC, "add_dispute_entry", { p_dispute: did, p_kind: "statement", p_body: "Traffic incident on the M25, venue was informed", p_files: [] });
    expect(((await db.from("booking_disputes").select("status").eq("id", did as string).single()).data as { status: string }).status).toBe("provider_response");
    expect((await rpc(orgC, "admin_dispute_update", { p_dispute: did, p_status: "resolved", p_note: "Self-resolving", p_resolution: null })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(admC, "admin_dispute_update", { p_dispute: did, p_status: "resolution_proposed", p_note: "Partial credit proposed", p_resolution: { refund: 100 } })).error).toBeNull();
    expect((await rpc(orgC, "accept_dispute_resolution", { p_dispute: did })).data).toBe("accepted");
    expect((await rpc(provC, "accept_dispute_resolution", { p_dispute: did })).data).toBe("resolved");
    // Both parties see the thread; outsiders do not.
    expect(((await provC.from("booking_dispute_entries").select("id").eq("dispute_id", did as string)).data ?? []).length).toBeGreaterThanOrEqual(4);
    expect((await outC.from("booking_disputes").select("id").eq("id", did as string)).data).toEqual([]);
  });
});
