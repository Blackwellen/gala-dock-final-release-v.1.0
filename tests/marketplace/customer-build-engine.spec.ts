import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q15 Customer Event Builder (domains 45–50; migration 202610291029). E2E at API level with disposable identities:
// a consumer birthday from a blank event to a confirmed venue + supplier, via package composition, venue-first holds,
// a backup, budget states, an order-group checkout (one payment per seller) confirmed by the payment path (the service
// role plays the deposit webhook, as in the Q10 specs — no live Stripe), versions, and the upgrade to an Organizer workspace.
const db = admin as unknown as SupabaseClient;
const at = (days: number, h: number) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const one = async <T = { id: string }>(q: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data as T; };
type U = { id: string; email: string };
type Budget = Record<string, number | null> & { warnings: { code: string }[]; categories: Record<string, Record<string, number>>; scenarios: Record<string, number> };

test.describe.configure({ mode: "serial" });
test.describe("Q15 customer event builder", () => {
  let cust: U, vOwner: U, dOwner: U, d2Owner: U, cOwner: U, stranger: U;
  let custC: SupabaseClient, vC: SupabaseClient, dC: SupabaseClient, strangerC: SupabaseClient;
  let V: string, D: string, D2: string, Cw: string, hall: string, pkg: string, dj: string, dj2: string, cater: string, event: string;
  let extraEvent: string | null = null;
  let iV: string, iDJ: string, iCat: string, iBackup: string, group: string, upgradedWs: string | null = null;
  const wss: string[] = [];
  const budget = async () => (await custC.rpc("event_budget_summary", { p_event: event })).data as Budget;
  const status = async (id: string) => (await one<{ status: string }>(db.from("build_items").select("status").eq("id", id).single())).status;

  test.beforeAll(async () => {
    [cust, vOwner, dOwner, d2Owner, cOwner, stranger] = await Promise.all(["q15-cust", "q15-v", "q15-d", "q15-d2", "q15-c", "q15-x"].map(l => createUser(l)));
    [V, D, D2, Cw] = await Promise.all([seedWorkspace(vOwner.id, "provider", "Q15 Test Venue Co"), seedWorkspace(dOwner.id, "provider", "Q15 Test DJ Co"),
      seedWorkspace(d2Owner.id, "provider", "Q15 Test DJ Two"), seedWorkspace(cOwner.id, "provider", "Q15 Test Caterer")]);
    wss.push(V, D, D2, Cw);
    await db.from("workspaces").update({ capabilities: ["service"] }).in("id", [D, D2, Cw]);
    const listing = async (ws: string, name: string, kind: string, category: string, price: number) =>
      (await one(db.from("listings").insert({ workspace_id: ws, name, kind, category, published: true, city: "Q15ville", price_from: price, capacity_max: kind === "venue" ? 80 : null }).select("id").single())).id;
    hall = await listing(V, "Q15 Test Party Hall", "venue", "venue", 900);
    [dj, dj2, cater] = await Promise.all([listing(D, "Q15 Test DJ", "service", "dj", 450), listing(D2, "Q15 Test DJ Two", "service", "dj", 400), listing(Cw, "Q15 Test Caterer", "service", "catering", 25)]);
    pkg = (await one(db.from("packages").insert({ workspace_id: V, listing_id: hall, name: "Q15 Party Package", status: "published", base_price: 40, price_basis: "per_person",
      min_guests: 20, max_guests: 80, deposit_pct: 30, inclusions: ["Room hire 6h", "Welcome drink"] }).select("id").single())).id;
    [custC, vC, dC, strangerC] = await Promise.all([cust, vOwner, dOwner, stranger].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    if (event) {
      const items = ((await db.from("build_items").select("id").eq("event_id", event)).data ?? []).map(x => x.id);
      await db.from("order_groups").delete().eq("event_id", event);
      await db.from("payment_orders").delete().in("build_item_id", items);
      await db.from("payments").delete().eq("event_id", event);
      for (const ws of wss) await db.from("provider_jobs").delete().eq("workspace_id", ws);
      await db.from("conditional_holds").delete().eq("event_id", event);
      await db.from("build_items").delete().eq("event_id", event);
      await db.from("provider_requests").delete().eq("event_id", event);
      await db.from("events").delete().eq("id", event);
    }
    if (extraEvent) { await db.from("build_items").delete().eq("event_id", extraEvent); await db.from("events").delete().eq("id", extraEvent); }
    if (upgradedWs) await db.from("workspaces").delete().eq("id", upgradedWs);
    for (const ws of wss) { await db.from("packages").delete().eq("workspace_id", ws); await db.from("listings").delete().eq("workspace_id", ws); await db.from("workspaces").delete().eq("id", ws); }
    await cleanup();
  });

  test("blank event: type-aware categories and non-AI guidance", async () => {
    event = (await one(custC.from("events").insert({ owner_id: cust.id, name: "Q15 Sam's 30th", event_type: "birthday", guest_count: 40, budget_total: 4000, city: "Q15ville" }).select("id").single())).id;
    const canvas = (await custC.rpc("event_build_canvas", { p_event: event })).data as { categories: { category: string; need: string }[]; guidance: Record<string, unknown> };
    expect(canvas.categories.map(c => c.category)).toEqual(["venue", "food", "drinks", "entertainment", "media", "styling", "extras"]);
    expect(canvas.categories.find(c => c.category === "venue")?.need).toBe("foundation");
    expect(canvas.guidance).toMatchObject({ source: "rules:v1", ai: false, planning_window: { state: "no_date" } });
    expect((canvas.guidance.next_steps as { code: string }[]).map(s => s.code)).toEqual(expect.arrayContaining(["set_date", "choose_venue"]));
    // Children's party gets its own categories (supervision is required).
    const kids = ((await custC.rpc("build_categories_for", { p_event_type: "childrens_party" })).data ?? []) as { category: string; need: string; label: string | null }[];
    expect(kids.find(k => k.category === "staff")).toMatchObject({ need: "required", label: "Supervision & Safety" });
    // Only the event's people can read the canvas.
    expect((await strangerC.rpc("event_build_canvas", { p_event: event })).error?.message).toMatch(/not_authorized/);
    expect((await vC.rpc("event_budget_summary", { p_event: event })).error?.message).toMatch(/not_authorized/);
  });

  test("package composition and supplier lines; venue-first dependencies refuse supplier holds without date/venue", async () => {
    iDJ = (await one(custC.from("build_items").insert({ event_id: event, listing_id: dj, category: "entertainment", title: "Q15 Test DJ", status: "suggested", amount: 450 }).select("id").single())).id;
    iCat = (await one(custC.from("build_items").insert({ event_id: event, listing_id: cater, category: "food", title: "Q15 Test Caterer", status: "suggested", amount: 1000, price_basis: "per_person" }).select("id").single())).id;
    // No date yet: a quoted supplier can't be held (checked on a second, dateless plan).
    extraEvent = (await one(custC.from("events").insert({ owner_id: cust.id, name: "Q15 undated plan", event_type: "birthday", guest_count: 10 }).select("id").single())).id;
    const undated = (await one(custC.from("build_items").insert({ event_id: extraEvent, listing_id: dj, category: "entertainment", title: "Q15 DJ undated", status: "suggested" }).select("id").single())).id;
    await db.from("build_items").update({ status: "quoted", amount: 300 }).eq("id", undated);
    expect((await custC.rpc("build_request_hold", { p_item: undated, p_hours: 48 })).error?.message).toMatch(/date_required/);
    expect((await custC.from("events").update({ starts_at: at(70, 17), ends_at: at(70, 23) }).eq("id", event)).error).toBeNull();
    await db.from("build_items").update({ status: "quoted", amount: 500, deposit: 150, price_basis: "quote" }).eq("id", iDJ);   // provider quote
    expect((await custC.rpc("build_request_hold", { p_item: iDJ, p_hours: 48 })).error?.message).toMatch(/venue_required/);
    let dep = (await custC.rpc("build_dependency_state", { p_event: event })).data as { venue_state: string; lines: { build_item_id: string; blocked_reason: string | null }[] };
    expect(dep.venue_state).toBe("missing");
    expect(dep.lines.find(l => l.build_item_id === iDJ)?.blocked_reason).toBe("venue_required");
    // Venue package: price snapshot = £40 × 40 guests, held as an estimate in minor units.
    const r = await custC.rpc("build_add_package", { p_event: event, p_package: pkg });
    expect(r.error).toBeNull(); iV = r.data as string;
    const line = await one<{ category: string; amount: number; package: string; quote: Record<string, unknown>; status: string }>(db.from("build_items").select("category,amount,package,quote,status").eq("id", iV).single());
    expect(line).toMatchObject({ category: "venue", amount: 1600, package: "Q15 Party Package", status: "suggested" });
    expect(line.quote).toMatchObject({ package_id: pkg, base_price_minor: 4000, guests: 40, inclusions: ["Room hire 6h", "Welcome drink"] });
    expect((await custC.rpc("build_add_package", { p_event: event, p_package: pkg })).error?.message).toMatch(/already_in_build/);
    await db.from("packages").update({ base_price: 99 }).eq("id", pkg);               // later price change does not rewrite the snapshot
    expect((await one<{ amount: number }>(db.from("build_items").select("amount").eq("id", iV).single())).amount).toBe(1600);
    dep = (await custC.rpc("build_dependency_state", { p_event: event })).data as typeof dep;
    expect(dep.venue_state).toBe("estimated");
  });

  test("conditional holds: venue first, then the supplier hold is conditional on the venue", async () => {
    await db.from("build_items").update({ status: "quoted", amount: 1600, deposit: 480, price_basis: "quote" }).eq("id", iV);   // venue quote
    const hv = await custC.rpc("build_request_hold", { p_item: iV, p_hours: 72 });
    expect(hv.error).toBeNull();
    expect((await vC.rpc("provider_respond_hold", { p_hold: hv.data, p_accept: true, p_hours: 72, p_note: "Held for you" })).error).toBeNull();
    expect(await status(iV)).toBe("held");
    const hd = await custC.rpc("build_request_hold", { p_item: iDJ, p_hours: 48 });
    expect(hd.error).toBeNull();
    const hold = await one<{ depends_on_item_id: string; dependency_state: string }>(db.from("conditional_holds").select("depends_on_item_id,dependency_state").eq("id", hd.data).single());
    expect(hold).toMatchObject({ depends_on_item_id: iV, dependency_state: "pending" });
    expect((await dC.rpc("provider_respond_hold", { p_hold: hd.data, p_accept: true, p_hours: 48, p_note: "" })).error).toBeNull();
    expect(await status(iDJ)).toBe("held");
  });

  test("backups: a different provider only; contingency is kept out of spend", async () => {
    expect((await custC.rpc("build_add_backup", { p_primary: iDJ, p_listing: dj })).error?.message).toMatch(/backup_same_provider/);
    const r = await custC.rpc("build_add_backup", { p_primary: iDJ, p_listing: dj2 });
    expect(r.error).toBeNull(); iBackup = r.data as string;
    expect(await one<{ role: string; category: string; quote: Record<string, unknown> }>(db.from("build_items").select("role,category,quote").eq("id", iBackup).single()))
      .toMatchObject({ role: "backup", category: "entertainment", quote: { backup_for: iDJ } });
    // Standby (paid) still goes through the Q10 standby engine for the backup line.
    expect((await custC.rpc("request_standby", { p_item: iBackup, p_primary: iDJ, p_window_start: at(70, 17), p_window_end: at(70, 23), p_note: "Q15 standby" })).error).toBeNull();
  });

  test("live budget states in integer minor units", async () => {
    const b = await budget();
    expect(b).toMatchObject({ target_minor: 400000, estimated_minor: 100000, quoted_minor: 0, held_minor: 210000, committed_minor: 0, paid_minor: 0,
      forecast_minor: 310000, remaining_minor: 90000, contingency_minor: 40000, contingency_lines: 1 });
    expect(b.scenarios).toMatchObject({ committed_only: 0, with_holds: 210000, everything: 310000, everything_with_backups: 350000 });
    expect(b.categories.venue).toMatchObject({ held_minor: 160000 });
    for (const v of [b.estimated_minor, b.held_minor, b.forecast_minor]) expect(Number.isInteger(v)).toBe(true);
  });

  test("checkout: one order group, one payment per seller (never pooled), idempotent under concurrent retries", async () => {
    // A supplier line can't be checked out on its own while the venue is only held? It can: the venue line is in the order.
    const [a, b] = await Promise.all([custC.rpc("build_checkout", { p_event: event, p_items: [iV, iDJ] }), custC.rpc("build_checkout", { p_event: event, p_items: [iV, iDJ] })]);
    expect(a.error).toBeNull(); expect(b.error).toBeNull();
    const ra = a.data as { order_group_id: string; pooled: boolean; sellers: number; charges: { build_item_id: string; seller_workspace_id: string; state: string; payment_reference: string; amount_minor: number }[] };
    const rb = b.data as typeof ra;
    expect(ra.order_group_id).toBe(rb.order_group_id);
    group = ra.order_group_id;
    expect(ra).toMatchObject({ pooled: false, sellers: 2 });
    expect(ra.charges.map(c => [c.build_item_id, c.seller_workspace_id, c.state, c.amount_minor])).toEqual([[iV, V, "payment_due", 48000], [iDJ, D, "payment_due", 15000]]);
    expect(rb.charges.map(c => c.payment_reference)).toEqual(ra.charges.map(c => c.payment_reference));
    const orders = (await db.from("payment_orders").select("payee_workspace_id,amount_minor,build_item_id,order_group").in("build_item_id", [iV, iDJ])).data ?? [];
    expect(orders).toHaveLength(2);                                             // one per child seller, no combined cart charge
    expect(new Set(orders.map(o => o.payee_workspace_id))).toEqual(new Set([V, D]));
    const items = (await db.from("order_group_items").select("build_item_id,depends_on_item_id").eq("group_id", group)).data ?? [];
    expect(items.find(i => i.build_item_id === iDJ)?.depends_on_item_id).toBe(iV);   // venue-first in the parent order
    expect((await strangerC.rpc("build_checkout", { p_event: event, p_items: [iV] })).error?.message).toMatch(/not_authorized/);
    // The buyer still can't confirm without paying (P1 guard).
    expect((await custC.from("build_items").update({ status: "confirmed" }).eq("id", iDJ)).error?.message).toMatch(/build_item_status_requires_command/);
  });

  test("E2E: the payment path confirms venue then supplier; partial state is consistent; budget shows committed and paid", async () => {
    const pay = async (item: string) => {
      const po = await one<{ id: string }>(db.from("payment_orders").select("id").eq("build_item_id", item).single());
      expect((await db.from("payment_orders").update({ status: "payment_succeeded" }).eq("id", po.id)).error).toBeNull();
      expect((await db.from("build_items").update({ status: "confirmed" }).eq("id", item)).error).toBeNull();   // deposit webhook effect
    };
    await pay(iV);
    expect(((await db.from("order_groups").select("status").eq("id", group).single()).data as { status: string }).status).toBe("partially_confirmed");
    expect(((await db.from("conditional_holds").select("dependency_state").eq("build_item_id", iDJ).order("created_at", { ascending: false }).limit(1).single()).data as { dependency_state: string }).dependency_state).toBe("met");
    await pay(iDJ);
    expect(((await db.from("order_groups").select("status").eq("id", group).single()).data as { status: string }).status).toBe("confirmed");
    expect((await db.from("provider_jobs").select("workspace_id").in("build_item_id", [iV, iDJ])).data?.map(j => j.workspace_id).sort()).toEqual([V, D].sort());
    const b = await budget();
    expect(b).toMatchObject({ committed_minor: 210000, held_minor: 0, estimated_minor: 100000, paid_minor: 63000, outstanding_committed_minor: 147000 });
    expect(await status(iCat)).toBe("suggested");                                    // the caterer is still an estimate, outside the order
    const dep = (await custC.rpc("build_dependency_state", { p_event: event })).data as { venue_state: string };
    expect(dep.venue_state).toBe("committed");
    const g = (await custC.rpc("event_planning_guidance", { p_event: event })).data as { booking_deadlines: { category: string; state: string }[] };
    expect(g.booking_deadlines.find(c => c.category === "venue")?.state).toBe("done");
    expect(g.booking_deadlines.find(c => c.category === "entertainment")?.state).toBe("done");
  });

  test("build versions are immutable and numbered without gaps under concurrency", async () => {
    const vs = await Promise.all([1, 2, 3].map(i => custC.rpc("build_snapshot", { p_event: event, p_label: `Q15 v${i}` })));
    expect(vs.map(v => v.error)).toEqual([null, null, null]);
    expect(vs.map(v => v.data as number).sort()).toEqual([1, 2, 3]);
    const v1 = await one<{ snapshot: { lines: unknown[]; budget: { committed_minor: number } } }>(custC.from("build_versions").select("snapshot").eq("event_id", event).eq("version", 1).single());
    expect(v1.snapshot.budget.committed_minor).toBe(210000);
    expect((await custC.from("build_versions").update({ label: "x" }).eq("event_id", event).select("version")).error).not.toBeNull();
    expect((await strangerC.from("build_versions").select("version").eq("event_id", event)).data).toHaveLength(0);
  });

  test("professional upgrade: new Organizer workspace, same event id, nothing lost; idempotent; owner only", async () => {
    expect((await strangerC.rpc("customer_upgrade_to_organizer", { p_event: event, p_workspace: null, p_name: "x" })).error?.message).toMatch(/not_authorized/);
    const before = ((await db.from("build_items").select("id").eq("event_id", event)).data ?? []).length;
    const r = await custC.rpc("customer_upgrade_to_organizer", { p_event: event, p_workspace: null, p_name: "Q15 Sam Events" });
    expect(r.error).toBeNull(); upgradedWs = r.data as string;
    const e = await one<{ id: string; workspace_id: string; management: string; owner_id: string }>(db.from("events").select("id,workspace_id,management,owner_id").eq("id", event).single());
    expect(e).toMatchObject({ id: event, workspace_id: upgradedWs, management: "professional", owner_id: cust.id });
    expect(await one<{ kind: string; name: string }>(db.from("workspaces").select("kind,name").eq("id", upgradedWs).single())).toMatchObject({ kind: "organizer", name: "Q15 Sam Events" });
    expect((await db.from("workspace_members").select("role,status").eq("workspace_id", upgradedWs).eq("user_id", cust.id).single()).data).toMatchObject({ role: "owner", status: "active" });
    expect(((await db.from("build_items").select("id").eq("event_id", event)).data ?? []).length).toBe(before);
    expect(((await db.from("order_groups").select("status").eq("id", group).single()).data as { status: string }).status).toBe("confirmed");
    expect((await custC.rpc("customer_upgrade_to_organizer", { p_event: event, p_workspace: null, p_name: "again" })).data).toBe(upgradedWs);
    // The organiser workspace now reads the same canvas.
    expect((await custC.rpc("event_build_canvas", { p_event: event })).error).toBeNull();
  });
});
