import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { canTransition } from "../../src/lib/domain/state-machines";
import { can } from "../../src/lib/domain/permissions";

// Phase 1 foundation: permissions, state guards, ledger, webhook idempotency — against the live project.
test.describe("foundation", () => {
  let owner: { id: string; email: string }, finance: { id: string; email: string }, member: { id: string; email: string }, outsider: { id: string; email: string };
  let ws: string, other: string;

  test.beforeAll(async () => {
    owner = await createUser("f-owner"); finance = await createUser("f-finance"); member = await createUser("f-member"); outsider = await createUser("f-out");
    ws = await seedWorkspace(owner.id, "organizer", "Foundation Org");
    other = await seedWorkspace(outsider.id, "organizer", "Other Org");
    await admin.from("workspace_members").insert([{ workspace_id: ws, user_id: finance.id, role: "finance" }, { workspace_id: ws, user_id: member.id, role: "member" }]);
  });
  test.afterAll(cleanup);

  test("TypeScript and database agree on the permission matrix", async () => {
    for (const [user, perm] of [[owner, "settings.manage"], [finance, "finance.read"], [member, "events.write"], [member, "finance.read"], [finance, "events.delete"]] as const) {
      const client = await signedIn(user.email);
      const { data } = await client.rpc("has_permission" as never, { p_workspace: ws, p_permission: perm } as never);
      const role = user === owner ? "owner" : user === finance ? "finance" : "member";
      expect(data, `${role} ${perm}`).toBe(can("organizer", role, perm));
    }
    // No permissions in a workspace you don't belong to, and none once suspended.
    const outsiderClient = await signedIn(outsider.email);
    expect((await outsiderClient.rpc("has_permission" as never, { p_workspace: ws, p_permission: "events.read" } as never)).data).toBe(false);
    await admin.from("workspace_members").update({ status: "suspended" }).eq("workspace_id", ws).eq("user_id", member.id);
    expect((await (await signedIn(member.email)).rpc("has_permission" as never, { p_workspace: ws, p_permission: "events.read" } as never)).data).toBe(false);
    await admin.from("workspace_members").update({ status: "active" }).eq("workspace_id", ws).eq("user_id", member.id);
  });

  test("enforced machine rejects illegal agent run transitions; legal path works", async () => {
    const { data: run, error } = await admin.from("agent_runs").insert({ workspace_id: ws, user_id: owner.id, goal: "Foundation test", status: "queued" } as never).select("id").single();
    expect(error).toBeNull();
    const id = (run as { id: string }).id;
    expect((await admin.from("agent_runs").update({ status: "completed" } as never).eq("id", id)).error?.message).toMatch(/illegal agent_run transition queued -> completed/);
    for (const s of ["running", "waiting_approval", "queued", "running", "completed"]) {
      expect((await admin.from("agent_runs").update({ status: s } as never).eq("id", id)).error, s).toBeNull();
    }
    expect((await admin.from("agent_runs").update({ status: "running" } as never).eq("id", id)).error?.message).toMatch(/illegal/);
    expect(canTransition("agent_run", "queued", "completed")).toBe(false);
  });

  test("audit-mode machine records violations without breaking existing flows", async () => {
    const before = (await admin.from("state_violations" as never).select("id", { count: "exact", head: true }).eq("machine", "quote")).count ?? 0;
    const { data: ev, error: evErr } = await admin.from("events").insert({ owner_id: outsider.id, workspace_id: other, name: "Audit test event" } as never).select("id").single();
    expect(evErr).toBeNull();
    const { data: item, error: itemErr } = await admin.from("build_items").insert({ event_id: (ev as { id: string }).id, category: "photography", title: "Audit test" } as never).select("id").single();
    expect(itemErr).toBeNull();
    const { data, error } = await admin.from("provider_quotes").insert({ workspace_id: other, build_item_id: (item as { id: string }).id, version: 1, reference: `QT-${randomUUID().slice(0, 6)}`, status: "draft", items: [], subtotal: 0, total: 0, currency: "GBP" } as never).select("id").single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    expect((await admin.from("provider_quotes").update({ status: "accepted" } as never).eq("id", id)).error).toBeNull(); // draft -> accepted is illegal but audited
    const after = (await admin.from("state_violations" as never).select("id", { count: "exact", head: true }).eq("machine", "quote")).count ?? 0;
    expect(after).toBe(before + 1);
    await admin.from("events").delete().eq("id", (ev as { id: string }).id);
  });

  test("ledger: balanced, idempotent, immutable, finance-scoped", async () => {
    const key = `test-${randomUUID()}`;
    const lines = [
      { account: "customer_payment", amount_minor: -10000, party_type: "user", party_id: owner.id },
      { account: "platform_fee", amount_minor: 1000, party_type: "platform" },
      { account: "provider_payable", amount_minor: 9000, party_type: "workspace", party_id: ws },
    ];
    const post = () => admin.rpc("post_ledger_transaction" as never, { p_idempotency_key: key, p_kind: "booking_payment", p_currency: "GBP", p_lines: lines, p_workspace: ws } as never);
    const first = await post(); const second = await post();
    expect(first.error).toBeNull();
    expect(second.data).toBe(first.data); // retry returns the same transaction
    expect((await admin.from("ledger_entries" as never).select("id").eq("transaction_id", first.data as never)).data).toHaveLength(3);
    // Unbalanced is rejected.
    const bad = await admin.rpc("post_ledger_transaction" as never, { p_idempotency_key: `bad-${randomUUID()}`, p_kind: "adjustment", p_currency: "GBP", p_lines: [{ account: "platform_fee", amount_minor: 5 }, { account: "payouts", amount_minor: -4 }] } as never);
    expect(bad.error?.message).toMatch(/unbalanced/);
    // Immutable even for the service role.
    expect((await admin.from("ledger_entries" as never).update({ amount_minor: 1 } as never).eq("transaction_id", first.data as never)).error?.message).toMatch(/immutable/);
    expect((await admin.from("ledger_transactions" as never).delete().eq("id", first.data as never)).error?.message).toMatch(/immutable/);
    // Finance can read; a member without finance.read and an outsider cannot; nobody can post directly.
    expect((await (await signedIn(finance.email)).from("ledger_transactions" as never).select("id").eq("id", first.data as never)).data).toHaveLength(1);
    expect((await (await signedIn(member.email)).from("ledger_transactions" as never).select("id").eq("id", first.data as never)).data).toEqual([]);
    expect((await (await signedIn(outsider.email)).from("ledger_entries" as never).select("id").eq("transaction_id", first.data as never)).data).toEqual([]);
    expect((await (await signedIn(owner.email)).rpc("post_ledger_transaction" as never, { p_idempotency_key: `x-${randomUUID()}`, p_kind: "adjustment", p_currency: "GBP", p_lines: lines } as never)).error).not.toBeNull();
  });

  test("webhook events are claimed exactly once, retried only after failure", async () => {
    const id = `evt_test_${randomUUID()}`;
    const claim = () => admin.rpc("claim_webhook_event" as never, { p_provider: "stripe", p_external_id: id, p_type: "payment_intent.succeeded", p_livemode: false } as never);
    const [a, b] = await Promise.all([claim(), claim()]); // concurrent duplicate delivery
    expect([a.data, b.data].filter(Boolean)).toHaveLength(1);
    await admin.rpc("finish_webhook_event" as never, { p_provider: "stripe", p_external_id: id, p_status: "failed", p_error: "boom" } as never);
    expect((await claim()).data).toBe(true); // failed → retried
    await admin.rpc("finish_webhook_event" as never, { p_provider: "stripe", p_external_id: id, p_status: "processed" } as never);
    expect((await claim()).data).toBe(false); // processed → duplicate ignored
    expect((await (await signedIn(owner.email)).from("webhook_events" as never).select("id")).error).not.toBeNull();
  });
});
