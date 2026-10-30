// Q32 owner decision · audited purge of TEST fixture workspaces (admin_purge_test_workspaces). API-level, no browser.
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, enrolTotp, PASSWORD, seedWorkspace, signedIn } from "../phase1/helpers";

const db = admin as unknown as SupabaseClient;
type U = { id: string; email: string };
test.describe.configure({ mode: "serial" });

test.describe("Q32 test fixture purge", () => {
  let O: U, A: U, B: U, N: U; let W = "", W2 = "", C = "", REAL = "", outsider = ""; let hold = ""; let PLAN = "", MOVE = 0;
  let ac: SupabaseClient, bc: SupabaseClient, nc: SupabaseClient;
  const purge = (c: SupabaseClient, ws: string[], dry = true) => c.rpc("admin_purge_test_workspaces", { p_workspaces: ws, p_reason: "Remove spec fixtures", p_dry_run: dry });

  test.beforeAll(async () => {
    [O, A, B, N] = await Promise.all([createUser("q32p-owner"), createUser("q32p-admin"), createUser("q32p-admin-nomfa"), createUser("q32p-nonadmin")]);
    W = await seedWorkspace(O.id, "organizer", "Q32 Purge Co");
    W2 = await seedWorkspace(O.id, "organizer", "Q32 Purge Co 2");
    await db.from("platform_admins").insert([{ user_id: A.id, title: "Q32 purge admin", permissions: ["workspaces"] }, { user_id: B.id, title: "Q32 purge admin (no MFA)", permissions: ["workspaces"] }]);
    // Append-only contract history, like the Q16 leftovers.
    C = ((await db.from("contracts").insert({ workspace_id: W, number: "CT-Q32-" + Date.now(), title: "Fixture contract" }).select("id").single()).data as { id: string }).id;
    await db.from("contract_versions").insert({ contract_id: C, version: 1, body: "Terms", document_hash: "a".repeat(64) });
    const party = (await db.from("contract_parties").insert({ contract_id: C, role: "client", name: "Client", email: "client@example.invalid" } as never).select("id").single()).data as { id: string } | null;
    if (party) await db.from("contract_signatures").insert({ contract_id: C, party_id: party.id, version: 1, method: "typed", typed_name: "Client", document_hash: "a".repeat(64) });
    // 4031: blockers found on live fixtures — an approved (immutable) safety plan, a published event map, append-only stock movements,
    // merch order lines (RESTRICT → merch items → stock items) and the "update" case: a NO ACTION resale allocation pointing at a fixture ticket
    // ("update or delete on table tickets violates foreign key constraint checkout_resale_allocations_ticket_id_fkey").
    const ok = <T,>(r: { data: T | null; error: { message: string } | null }) => { expect(r.error?.message ?? null).toBeNull(); return r.data as T; };
    const E2 = ok(await db.from("events").insert({ owner_id: O.id, workspace_id: W2, name: "Q32 fixture show" }).select("id").single() as never as { data: { id: string }; error: null }).id;
    ok(await db.from("venue_maps").insert({ event_id: E2, version: 1, status: "published" }));
    PLAN = ok(await db.from("safety_plans").insert({ event_id: E2, workspace_id: W2, kind: "event_safety", version: 1, status: "draft", title: "Fixture plan" }).select("id").single() as never as { data: { id: string }; error: null }).id;
    for (const st of ["submitted", "approved"]) ok(await db.from("safety_plans").update({ status: st }).eq("id", PLAN));
    const item = ok(await db.from("stock_items").insert({ workspace_id: W2, category: "merchandise", name: "Fixture tees" }).select("id").single() as never as { data: { id: string }; error: null }).id;
    MOVE = ok(await db.from("stock_movements").insert({ item_id: item, kind: "receive", quantity: 5 }).select("id").single() as never as { data: { id: number }; error: null }).id;
    const merch = ok(await db.from("merch_items").insert({ workspace_id: W2, stock_item_id: item, name: "Fixture tee", price_minor: 1000 }).select("id").single() as never as { data: { id: string }; error: null }).id;
    const order = ok(await db.from("merch_orders").insert({ workspace_id: W2 }).select("id").single() as never as { data: { id: string }; error: null }).id;
    ok(await db.from("merch_order_lines").insert({ order_id: order, merch_item_id: merch, qty: 1, unit_minor: 1000 }));
    const tier = ok(await db.from("ticket_tiers").insert({ event_id: E2, name: "GA", price: 0, quantity: 10 }).select("id").single() as never as { data: { id: string }; error: null }).id;
    const tk = ok(await db.from("tickets").insert({ code: `Q32P${Date.now()}`, event_id: E2, tier_id: tier, holder_id: O.id, order_ref: `Q32P${Date.now()}`, status: "valid" }).select("id").single() as never as { data: { id: string }; error: null }).id;
    const ref = `Q32RA${Date.now()}`;
    ok(await db.from("checkout_orders").insert({ order_ref: ref, event_id: E2, token: "t".repeat(32), amount: 1, kind: "primary" }));   // allocation row added directly (the resale capture path needs a live hold)
    ok(await db.from("checkout_resale_allocations").insert({ order_ref: ref, ticket_id: tk, amount_minor: 100 }));
    REAL = ((await db.from("workspaces").select("id,owner_id").eq("status", "active").eq("is_test_fixture", false).limit(50)).data ?? [])
      .map(w => w as { id: string; owner_id: string })[0]?.id ?? "";
    const o = await admin.auth.admin.createUser({ email: `q32-outsider-${Date.now()}@example.invalid`, password: PASSWORD, email_confirm: true });
    outsider = o.data.user!.id;
    [ac, bc, nc] = await Promise.all([A, B, N].map(async u => (await signedIn(u.email)) as unknown as SupabaseClient));
    await enrolTotp(ac as never);
  });

  test.afterAll(async () => {
    if (hold) await db.from("legal_holds").delete().eq("id", hold);
    await db.from("platform_admins").delete().in("user_id", [A.id, B.id]);
    if (outsider) await admin.auth.admin.deleteUser(outsider);
    await cleanup();
  });

  test("refuses a non-admin, an admin without MFA, a non-test workspace, a non-test member and a legal hold", async () => {
    expect((await purge(nc, [W])).error?.message).toBe("not_authorized");
    expect((await purge(bc, [W])).error?.message).toBe("step_up_required");
    if (REAL) {
      const owner = (await db.from("workspaces").select("owner_id").eq("id", REAL).single()).data as { owner_id: string };
      const email = (await admin.auth.admin.getUserById(owner.owner_id)).data.user?.email ?? "";
      if (!/^p1-[a-z0-9-]+-[0-9a-f]{8}@gala-dock\.test$/.test(email)) expect((await purge(ac, [REAL])).error?.message).toMatch(/purge_refused.*not_test_fixture/);
    }
    // Clients can't flag their own workspace as a fixture.
    const oc = (await signedIn(O.email)) as unknown as SupabaseClient;
    await oc.from("workspaces").update({ is_test_fixture: false } as never).eq("id", W);
    expect(((await db.from("workspaces").select("is_test_fixture").eq("id", W).single()).data as { is_test_fixture: boolean }).is_test_fixture).toBe(true);
    await db.from("workspace_members").insert({ workspace_id: W2, user_id: outsider, role: "member", status: "active" });
    expect((await purge(ac, [W2])).error?.message).toMatch(/purge_refused.*non_test_member/);
    await db.from("workspace_members").delete().eq("workspace_id", W2).eq("user_id", outsider);
    hold = ((await db.from("legal_holds").insert({ reference: "LH-T" + Date.now(), matter: "Spec matter", reason: "Spec legal hold" }).select("id").single()).data as { id: string }).id;
    await db.from("legal_hold_subjects").insert({ hold_id: hold, subject_type: "workspace", subject_id: W });
    expect((await purge(ac, [W, W2])).error?.message).toMatch(/purge_refused.*legal_hold/);
    await db.from("legal_holds").update({ status: "released", released_at: new Date().toISOString() }).eq("id", hold);
    // Outside a purge the guards still hold (4031 only opens them for an audited purge record of this transaction).
    expect((await db.from("safety_plans").delete().eq("id", PLAN)).error?.message).toBe("plan_immutable");
    expect((await db.from("stock_movements").update({ reason: "tamper" }).eq("id", MOVE)).error?.message).toBe("stock_movements_append_only");
    expect((await db.from("stock_movements").delete().eq("id", MOVE)).error?.message).toBe("stock_movements_append_only");
  });

  test("dry run reports per-table counts and deletes nothing", async () => {
    const r = await purge(ac, [W, W2]);
    expect(r.error).toBeNull();
    const d = r.data as { dry_run: boolean; tables: Record<string, { deleted: number }>; users_to_remove: string[] };
    expect(d.dry_run).toBe(true);
    expect(d.tables.workspaces.deleted).toBe(2);
    expect(d.tables.contract_versions.deleted).toBe(1);
    for (const t of ["safety_plans", "venue_maps", "stock_movements", "merch_order_lines", "checkout_resale_allocations"]) expect(d.tables[t]?.deleted, t).toBe(1);
    expect(d.users_to_remove).toContain(O.id);
    expect(((await db.from("workspaces").select("id").in("id", [W, W2])).data ?? [])).toHaveLength(2);
    expect(((await db.from("contract_versions").select("id").eq("contract_id", C)).data ?? [])).toHaveLength(1);
  });

  test("purge removes everything, the record survives, append-only still blocks normal writers", async () => {
    const r = await purge(ac, [W, W2], false);
    expect(r.error).toBeNull();
    const d = r.data as { purge_id: string; tables: Record<string, { deleted: number }> };
    expect(((await db.from("workspaces").select("id").in("id", [W, W2])).data ?? [])).toHaveLength(0);
    expect(((await db.from("contracts").select("id").eq("id", C)).data ?? [])).toHaveLength(0);
    expect(((await db.from("contract_versions").select("id").eq("contract_id", C)).data ?? [])).toHaveLength(0);
    expect(((await db.from("safety_plans").select("id").eq("id", PLAN)).data ?? [])).toHaveLength(0);
    expect(((await db.from("stock_movements").select("id").eq("id", MOVE)).data ?? [])).toHaveLength(0);
    const rec = (await ac.from("fixture_purges").select("id,dry_run,reason,workspace_ids").eq("id", d.purge_id).single()).data as { dry_run: boolean; workspace_ids: string[] };
    expect(rec.dry_run).toBe(false);
    expect(rec.workspace_ids.sort()).toEqual([W, W2].sort());
    const counts = (await ac.from("fixture_purge_counts").select("table_name,deleted").eq("purge_id", d.purge_id)).data ?? [];
    expect(counts.find(c => c.table_name === "workspaces")?.deleted).toBe(2);
    expect((await db.from("fixture_purges").delete().eq("id", d.purge_id)).error?.message).toBe("fixture_purges_append_only");
    expect(((await db.from("audit_events").select("id").eq("event", "admin.test_fixtures_purged").eq("actor_id", A.id)).data ?? []).length).toBe(1);
    // Append-only still holds for everyone else.
    const other = (await db.from("contract_versions").select("contract_id").limit(1)).data?.[0] as { contract_id: string } | undefined;
    if (other) expect((await db.from("contract_versions").delete().eq("contract_id", other.contract_id)).error?.message).toBe("contract_versions_append_only");
    expect((await nc.from("fixture_purges").select("id")).data ?? []).toHaveLength(0);
  });
});

// Independent of the purge fixtures above (runs on its own with --grep "customer-write"; never purges anything).
test.describe("Q39 customer-write smoke (4031 regression guard)", () => {
  // Q39 (c) — the 4031 regression: purge-aware guard triggers called fixture_purge_active() as the caller without an EXECUTE grant,
  // so every client write on 9 tables failed (42501). A customer must be able to add, edit and remove a build item as `authenticated`.
  test("customer-write smoke: build_items insert, update and delete as authenticated", async () => {
    const cust = await createUser("q32p-customer");
    const cc = (await signedIn(cust.email)) as unknown as SupabaseClient;
    const ev = await cc.from("events").insert({ owner_id: cust.id, management: "consumer", name: "Q39 smoke birthday", event_type: "birthday", status: "draft" }).select("id").single();
    expect(ev.error?.message ?? null).toBeNull();
    const evId = (ev.data as { id: string }).id;
    const ins = await cc.from("build_items").insert({ event_id: evId, category: "decor", title: "Balloon arch", amount: 120, status: "draft", role: "primary", sort: 1 }).select("id, title").single();
    expect(ins.error?.message ?? null).toBeNull();
    const id = (ins.data as { id: string }).id;
    const upd = await cc.from("build_items").update({ title: "Balloon arch (gold)", amount: 140 }).eq("id", id).select("id, title, amount");
    expect(upd.error?.message ?? null).toBeNull();
    expect(upd.data).toEqual([{ id, title: "Balloon arch (gold)", amount: 140 }]);
    const del = await cc.from("build_items").delete().eq("id", id).select("id");
    expect(del.error?.message ?? null).toBeNull();
    expect(del.data).toHaveLength(1);
    expect(((await db.from("build_items").select("id").eq("id", id)).data ?? [])).toHaveLength(0);
    // Another customer can't touch it (RLS still applies on the same path).
    const other = await createUser("q32p-customer-2");
    const oc = (await signedIn(other.email)) as unknown as SupabaseClient;
    expect(((await oc.from("build_items").insert({ event_id: evId, category: "decor", title: "Intruder", amount: 1, status: "draft", role: "primary", sort: 2 }).select("id")).data ?? [])).toHaveLength(0);
    await db.from("events").delete().eq("id", evId);
    await cleanup();
  });
});
