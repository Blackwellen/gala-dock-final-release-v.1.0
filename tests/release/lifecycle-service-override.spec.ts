// Q39 (a) · migration 202610293032 — service-role direct lifecycle writes past blockers require the audited override. API-level, no browser.
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, insertEventFixture, seedWorkspace, signedIn, updateEventFixture } from "../phase1/helpers";

const db = admin as unknown as SupabaseClient;
type Id = { id: string };

test.describe("Q39 service-role lifecycle override", () => {
  let owner: { id: string; email: string }, ws = "";
  const ids: string[] = [];
  test.beforeAll(async () => {
    owner = await createUser("q39-lc");
    ws = await seedWorkspace(owner.id, "organizer", "Q39 Lifecycle Co");
  });
  test.afterAll(async () => { if (ids.length) await db.from("events").delete().in("id", ids); await cleanup(); });

  test("direct service-role insert/update into on_sale past blockers is refused; draft and no-blocker writes still work", async () => {
    const ins = await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Q39 direct", status: "on_sale" }).select("id");
    expect(ins.error?.code).toBe("22023");
    expect(ins.error?.message).toMatch(/^lifecycle_override_required: /);
    expect(ins.error?.hint).toMatch(/service_set_event_status, service_insert_event or service_update_events/);
    const d = await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name: "Q39 draft", status: "draft" }).select("id").single();
    expect(d.error).toBeNull(); ids.push((d.data as Id).id);
    const up = await db.from("events").update({ status: "published" }).eq("id", ids[0]).select("id");
    expect(up.error?.message).toMatch(/^lifecycle_override_required: .*Set the event date/);
    expect((await db.from("events").select("status").eq("id", ids[0]).single()).data).toEqual({ status: "draft" });
  });

  test("fixture helpers go through the override: same columns, visibility untouched, every use logged and audited", async () => {
    const r = await insertEventFixture({ owner_id: owner.id, workspace_id: ws, name: "Q39 helper", status: "on_sale", tags: ["q39"], settings: { x: 1 } }, "lifecycle-service-override").select("id, status, visibility, tags, settings").single();
    expect(r.error).toBeNull();
    const ev = r.data as { id: string; status: string; visibility: string; tags: string[]; settings: { x: number } };
    ids.push(ev.id);
    expect(ev).toMatchObject({ status: "on_sale", visibility: "private", tags: ["q39"], settings: { x: 1 } });
    const u = await updateEventFixture(ids[0], { status: "published" }, "lifecycle-service-override");
    expect(u.error).toBeNull();
    expect((u.data as { status: string; visibility: string }[])[0]).toMatchObject({ status: "published", visibility: "private" });
    const uses = (await db.from("event_lifecycle_overrides").select("source, kind, db_role, to_status, blockers, grant_id").in("event_id", ids).eq("kind", "use")).data as { source: string; db_role: string; to_status: string; blockers: { key: string }[]; grant_id: string }[];
    expect(uses).toHaveLength(2);
    expect(uses.every(x => x.source === "override" && x.db_role === "service_role" && x.grant_id)).toBe(true);
    expect(uses.map(x => x.to_status).sort()).toEqual(["on_sale", "published"]);
    expect(uses.find(x => x.to_status === "published")!.blockers.map(b => b.key)).toContain("date");
    const grants = (await db.from("event_lifecycle_overrides").select("reason").in("id", uses.map(x => x.grant_id))).data as { reason: string }[];
    expect(grants.map(g => g.reason)).toEqual(["spec fixture: lifecycle-service-override", "spec fixture: lifecycle-service-override"]);
    const audit = (await db.from("audit_events").select("event, metadata").in("event", ["event.service_insert", "event.service_update"]).eq("workspace_id", ws)).data as { event: string; metadata: { from?: string; to?: string } }[];
    expect(audit.map(a => a.event).sort()).toEqual(["event.service_insert", "event.service_update"]);
    expect(audit.find(a => a.event === "event.service_update")!.metadata).toMatchObject({ from: "draft", to: "published" });
    expect(((await db.from("event_lifecycle_overrides").select("id").in("event_id", ids).eq("source", "service_direct")).data ?? [])).toHaveLength(0);
  });

  test("helpers are service-only, reject unknown columns and id changes; end users still get lifecycle_preconditions", async () => {
    const oc = (await signedIn(owner.email)) as unknown as SupabaseClient;
    expect((await oc.rpc("service_insert_event", { p_row: { name: "x" }, p_reason: "client attempt" })).error?.code).toBe("42501");
    expect((await oc.rpc("service_update_events", { p_ids: [ids[0]], p_patch: { status: "on_sale" }, p_reason: "client attempt" })).error?.code).toBe("42501");
    expect((await insertEventFixture({ nope: 1 })).error?.message).toMatch(/unknown_column: nope/);
    expect((await updateEventFixture(ids[0], { id: ids[1] })).error?.message).toBe("id_immutable");
    const d = await oc.from("events").insert({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Q39 user draft", status: "draft" }).select("id").single();
    expect(d.error).toBeNull(); ids.push((d.data as Id).id);
    expect((await oc.from("events").update({ status: "published" }).eq("id", (d.data as Id).id)).error?.message).toMatch(/^lifecycle_preconditions: /);
  });
});
