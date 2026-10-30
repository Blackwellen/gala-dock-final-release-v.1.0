import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, enrolTotp, signedIn } from "../phase1/helpers";

// Q36 experimentation and experiment safety (domains 229–230) — API-level, disposable admins, test-only experiment keys.
// Exit gate: deterministic assignment/exposure; safety/payment/ticket invariants cannot be changed by an experiment.
type U = { id: string; email: string };
const db = admin as unknown as SupabaseClient;
const rpc = async <T>(c: SupabaseClient, fn: string, args: Record<string, unknown>) => (await c.rpc(fn, args)) as { data: T; error: { message: string } | null };
type A = { variant: string | null; in_experiment: boolean; reason: string; config: Record<string, unknown> };

test.describe.configure({ mode: "serial" });

test.describe("Q36 experiments", () => {
  let A1: U, A2: U, P: U; let a1: SupabaseClient, a2: SupabaseClient, pc: SupabaseClient;
  const tag = randomBytes(3).toString("hex");
  const k = (s: string) => `q36t.${tag}.${s}`;
  const idOf = async (key: string) => (await db.from("experiments").select("id").eq("key", key).single()).data!.id as string;
  const save = (c: SupabaseClient, def: Record<string, unknown>, variants: Record<string, unknown>[]) => rpc<string>(c, "admin_experiment_save", { p_def: def, p_variants: variants, p_reason: "q36 spec" });
  const act = async (c: SupabaseClient, key: string, action: string) => rpc<{ to: string }>(c, "admin_experiment_transition", { p_id: await idOf(key), p_action: action, p_reason: `q36 spec ${action}` });
  const two = [{ key: "control", is_control: true, weight: 50, config: { layout: "a" } }, { key: "treat", weight: 50, config: { layout: "b" } }];

  test.beforeAll(async () => {
    [A1, A2, P] = await Promise.all([createUser("q36-admin1"), createUser("q36-admin2"), createUser("q36-plain")]);
    await db.from("platform_admins").insert([{ user_id: A1.id, title: "Q36 admin 1", permissions: ["settings"] }, { user_id: A2.id, title: "Q36 admin 2", permissions: ["settings", "commerce"] }]);
    [a1, a2, pc] = (await Promise.all([A1, A2, P].map(u => signedIn(u.email)))) as unknown as SupabaseClient[];
    await enrolTotp(a1 as never); await enrolTotp(a2 as never);
  });
  test.afterAll(async () => {
    await db.from("experiments").delete().like("key", `q36t.${tag}.%`);
    await db.from("experiment_holdouts").delete().like("reason", "q36 spec%");
    await db.from("platform_admins").delete().in("user_id", [A1.id, A2.id]);
    await cleanup();
  });

  test("protected configuration is refused for every kind (money, inventory, legal, safety)", async () => {
    for (const [kind, config] of [["checkout", { fee_display: "hidden" }], ["feature", { ui: { ticket_capacity: 1 } }], ["ranking", { refund_window: 1 }],
      ["onboarding", { terms_copy: "x" }], ["promotion", { price: 1 }], ["checkout", { unlisted_key: 1 }]] as const) {
      const r = await save(a1, { key: k(`bad${kind}${Object.keys(config)[0]}`.replace(/_/g, "")), name: "Bad config", kind }, [two[0]!, { key: "t", weight: 1, config }]);
      expect(r.error?.message, `${kind} ${JSON.stringify(config)}`).toContain("experiment_config_protected");
    }
    expect((await save(pc, { key: k("plain"), name: "Plain user", kind: "feature" }, two)).error?.message).toContain("not_authorized");
  });

  test("deterministic, sticky assignment with even split, traffic, holdout and layer conflicts", async () => {
    expect((await save(a1, { key: k("feat"), name: "Feature", kind: "feature", unit: "user", layer: `l${tag}`, traffic_pct: 100, holdout_pct: 10, targeting: { exclude_demo: false } }, two)).error).toBeNull();
    expect((await act(a1, k("feat"), "start")).data.to).toBe("running");
    const users = Array.from({ length: 300 }, () => randomUUID());
    const first = await Promise.all(users.map(u => rpc<A>(db, "experiment_assign", { p_key: k("feat"), p_user: u, p_workspace: null })));
    const again = await Promise.all(users.map(u => rpc<A>(db, "experiment_assign", { p_key: k("feat"), p_user: u, p_workspace: null })));
    expect(again.map(r => r.data.variant)).toEqual(first.map(r => r.data.variant));                // sticky
    const counts = first.reduce<Record<string, number>>((m, r) => ({ ...m, [r.data.reason + ":" + r.data.variant]: (m[r.data.reason + ":" + r.data.variant] ?? 0) + 1 }), {});
    expect(counts["holdout:control"]).toBeGreaterThan(10);                                         // ≈10% holdout
    expect(counts["holdout:control"]).toBeLessThan(60);
    expect(counts["assigned:treat"]).toBeGreaterThan(90);                                          // ≈45% each
    expect(counts["assigned:control"]).toBeGreaterThan(90);
    const b1 = await rpc<number>(db, "experiment_bucket", { p_salt: "fixed", p_unit: "u:abc" });
    expect((await rpc<number>(db, "experiment_bucket", { p_salt: "fixed", p_unit: "u:abc" })).data).toBe(b1.data);   // deterministic across calls
    // Same layer: units already in `feat` get layer_conflict in a second experiment.
    await save(a1, { key: k("feat2"), name: "Feature two", kind: "feature", unit: "user", layer: `l${tag}`, targeting: { exclude_demo: false } }, two);
    await act(a1, k("feat2"), "start");
    const inFeat = users.filter((_, i) => first[i]!.data.reason === "assigned").slice(0, 20);
    const second = await Promise.all(inFeat.map(u => rpc<A>(db, "experiment_assign", { p_key: k("feat2"), p_user: u, p_workspace: null })));
    expect(new Set(second.map(r => r.data.reason))).toEqual(new Set(["layer_conflict"]));
    expect((await act(a1, k("feat2"), "stop")).data.to).toBe("stopped");
    // Exposure is logged once per unit (counter increments), never for unassigned units.
    for (let i = 0; i < 2; i++) await Promise.all(inFeat.map(u => rpc(db, "experiment_expose", { p_key: k("feat"), p_user: u, p_workspace: null, p_surface: "spec" })));
    const ex = (await db.from("experiment_exposures").select("exposures").eq("experiment_id", await idOf(k("feat")))).data ?? [];
    expect(ex).toHaveLength(20);
    expect(ex.every(e => e.exposures === 2)).toBe(true);
    expect((await rpc<boolean>(db, "experiment_expose", { p_key: k("feat"), p_user: randomUUID(), p_workspace: null })).data).toBe(false);
    // Stored unit ids are pseudonymous.
    const units = (await db.from("experiment_assignments").select("unit_id").eq("experiment_id", await idOf(k("feat"))).limit(5)).data ?? [];
    expect(units.every(u => /^u:[0-9a-f]{64}$/.test(u.unit_id))).toBe(true);
  });

  test("demo exclusion, opt-out and the global kill switch serve control", async () => {
    // Demo/test identities are excluded by default (createUser uses @gala-dock.test).
    await save(a1, { key: k("demo"), name: "Demo default", kind: "feature", unit: "user" }, two);
    await act(a1, k("demo"), "start");
    expect((await rpc<A>(db, "experiment_assign", { p_key: k("demo"), p_user: P.id, p_workspace: null })).data.reason).toBe("demo_excluded");
    await db.from("consent_records").insert({ user_id: P.id, purpose: "experiments", granted: false, policy_version: "draft", source: "settings" });
    expect((await rpc<A>(db, "experiment_assign", { p_key: k("feat"), p_user: P.id, p_workspace: null })).data.reason).toBe("opted_out");
    expect((await rpc<boolean>(db, "experiments_killed", {})).data).toBe(false);
    expect((await act(a1, k("demo"), "stop")).data.to).toBe("stopped");
    expect((await rpc<A>(db, "experiment_assign", { p_key: k("demo"), p_user: randomUUID(), p_workspace: null })).data).toMatchObject({ variant: "control", in_experiment: false, reason: "not_running" });
  });

  test("pricing and legal-text experiments need a second admin's approval; definitions freeze while running", async () => {
    const pricing = [{ key: "control", is_control: true, weight: 1, config: { price_book_ref: "organizer:pro:month" } }, { key: "annual", weight: 1, config: { price_book_ref: "organizer:pro:year" } }];
    expect((await save(a1, { key: k("price"), name: "Pricing", kind: "pricing", unit: "workspace", layer: `p${tag}` }, pricing)).error).toBeNull();
    expect((await save(a1, { key: k("price2"), name: "Pricing bad", kind: "pricing", unit: "workspace" }, [pricing[0]!, { key: "x", weight: 1, config: { price_book_ref: "organizer:gold:month" } }])).error?.message).toContain("unknown_price_book_ref");
    expect((await act(a1, k("price"), "start")).error?.message).toContain("approval_required");
    expect((await act(a1, k("price"), "submit")).data.to).toBe("pending_approval");
    expect((await act(a1, k("price"), "approve")).error?.message).toContain("four_eyes_required");
    expect((await act(a2, k("price"), "approve")).data.to).toBe("approved");
    expect((await act(a1, k("price"), "start")).data.to).toBe("running");
    await save(a1, { key: k("terms"), name: "Terms wording", kind: "feature", surface: "checkout_terms" }, two);
    expect((await db.from("experiments").select("touches_legal").eq("key", k("terms")).single()).data?.touches_legal).toBe(true);
    expect((await act(a1, k("terms"), "start")).error?.message).toContain("approval_required");
    // Frozen while running: definition and variants.
    expect((await db.from("experiments").update({ traffic_pct: 5 }).eq("key", k("feat"))).error?.message).toContain("experiment_frozen");
    expect((await db.from("experiment_variants").insert({ experiment_id: await idOf(k("feat")), key: "late", weight: 1 })).error?.message).toContain("experiment_frozen");
    expect((await db.from("experiments").update({ status: "draft" }).eq("key", k("feat"))).error?.message).toContain("illegal experiment transition");
    expect(((await db.from("experiment_versions").select("version").eq("experiment_id", await idOf(k("price")))).data ?? []).length).toBe(1);
  });

  test("guardrail breach stops the experiment; admin overview and evaluation", async () => {
    await save(a1, { key: k("guard"), name: "Guarded", kind: "feature", unit: "user", layer: `g${tag}`, targeting: { exclude_demo: false },
      guardrails: [{ event_rate: "checkout.completed", direction: "min", threshold: 0.5, min_units: 3 }] }, two);
    await act(a1, k("guard"), "start");
    const users = Array.from({ length: 40 }, () => randomUUID());
    for (const u of users) { await rpc(db, "experiment_assign", { p_key: k("guard"), p_user: u, p_workspace: null }); await rpc(db, "experiment_expose", { p_key: k("guard"), p_user: u, p_workspace: null }); }
    const ev = await rpc<{ breached: boolean }>(a1, "experiment_evaluate", { p_id: await idOf(k("guard")) });
    expect(ev.data.breached).toBe(true);                                                             // nobody converts → below the 0.5 floor
    expect((await rpc(pc, "experiment_evaluate", { p_id: await idOf(k("guard")) })).error?.message).toContain("not_authorized");
    await rpc(db, "experiment_guardrail_sweep", {});
    expect((await db.from("experiments").select("status,stop_reason").eq("key", k("guard")).single()).data).toEqual({ status: "stopped", stop_reason: "guardrail_breach" });
    const ov = await rpc<{ experiments: { key: string; status: string }[]; killed: boolean }>(a1, "admin_experiments_overview", {});
    expect(ov.data.experiments.find(e => e.key === k("guard"))?.status).toBe("stopped");
    expect((await rpc(pc, "admin_experiments_overview", {})).error?.message).toContain("not_authorized");
    expect((await pc.from("experiments").select("id")).data ?? []).toHaveLength(0);
    expect((await pc.from("experiment_assignments").select("unit_id")).error?.message).toMatch(/permission denied/);
    const hid = await rpc<string>(a1, "admin_experiment_holdout", { p_layer: `h${tag}`, p_pct: 5, p_days: 1, p_reason: "q36 spec holdout" });
    expect(hid.error).toBeNull();
  });
});
