// Q32 · Privacy / deletion / retention / legal hold — API-level, disposable identities, no browser, no emails.
// Exit gate: erasure removes unnecessary data while preserving justified immutable financial / audit history.
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, enrolTotp, PASSWORD, seedWorkspace, signedIn } from "../phase1/helpers";

const db = admin as unknown as SupabaseClient;
type U = { id: string; email: string };
const day = 864e5, iso = (t: number) => new Date(t).toISOString();
test.describe.configure({ mode: "serial" });

test.describe("Q32 privacy / retention / legal hold", () => {
  let O: U, S: U, M: U, X: U, A: U; let W = "", EV = "", OLD = "", G = "", REF = ""; const holds: string[] = [];
  let oc: SupabaseClient, sc: SupabaseClient, mc: SupabaseClient, xc: SupabaseClient, ac: SupabaseClient;
  const as = async (u: U) => (await signedIn(u.email, PASSWORD)) as unknown as SupabaseClient;

  test.beforeAll(async () => {
    [O, S, M, X, A] = await Promise.all([createUser("q32-org"), createUser("q32-subject"), createUser("q32-member"), createUser("q32-other"), createUser("q32-admin")]);
    W = await seedWorkspace(O.id, "organizer", "Q32 Events");
    await db.from("workspace_members").insert({ workspace_id: W, user_id: M.id, role: "member", status: "active" });
    await db.from("platform_admins").insert({ user_id: A.id, title: "Q32 privacy admin", permissions: ["audit"] });
    EV = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, name: "Q32 Gala", starts_at: iso(Date.now() + 20 * day) }).select("id").single()).data as { id: string }).id;
    OLD = ((await db.from("events").insert({ owner_id: O.id, workspace_id: W, name: "Q32 Old Gala", starts_at: iso(Date.now() - 400 * day), ends_at: iso(Date.now() - 399 * day) }).select("id").single()).data as { id: string }).id;
    G = ((await db.from("guests").insert({ event_id: EV, name: "Sam Subject", email: S.email.toUpperCase(), phone: "07700900000", dietary: "coeliac" }).select("id").single()).data as { id: string }).id;
    const form = ((await db.from("registration_forms").insert({ event_id: EV, title: "Q32 form", fields: [] }).select("id").single()).data as { id: string }).id;
    await db.from("registrations").insert({ event_id: EV, form_id: form, form_version: 1, name: "Sam Subject", email: S.email, user_id: S.id, status: "submitted", answers: { company: "Acme" } });
    REF = "GD-Q32" + Date.now().toString(36).toUpperCase();
    await db.from("checkout_orders").insert({ order_ref: REF, event_id: EV, buyer_id: S.id, token: "q32" + REF, amount: 10, fee: 1, status: "issued", stripe_session: "cs_test_" + REF, lines: [] });
    [oc, sc, mc, xc, ac] = await Promise.all([as(O), as(S), as(M), as(X), as(A)]);
    await enrolTotp(ac as never);
  });

  test.afterAll(async () => {
    for (const h of holds) await db.from("legal_holds").delete().eq("id", h);
    await db.from("checkout_orders").delete().eq("order_ref", REF);
    await db.from("events").delete().in("id", [EV, OLD]);
    await db.from("workspaces").delete().eq("id", W);
    await db.from("platform_admins").delete().eq("user_id", A.id);
    await cleanup();
  });

  test("legacy guests.dietary is no longer exposed; managers read guest_care, members don't", async () => {
    expect((await mc.from("guests").select("dietary").eq("id", G).single()).data?.dietary).toBe("");
    expect((await mc.from("guest_care").select("dietary").eq("guest_id", G)).data ?? []).toHaveLength(0);
    expect((await oc.from("guests").select("dietary").eq("id", G).single()).data?.dietary).toBe("");
    expect((await oc.from("guest_care").select("dietary").eq("guest_id", G).single()).data?.dietary).toBe("coeliac");
    await oc.from("guests").update({ dietary: "vegan" }).eq("id", G);   // deployed write path still works
    expect((await oc.from("guest_care").select("dietary").eq("guest_id", G).single()).data?.dietary).toBe("vegan");
    expect((await db.from("guests").select("dietary").eq("id", G).single()).data?.dietary).toBe("");
  });

  test("DSAR export includes organiser-held records about the subject, and only the subject's", async () => {
    const r = (await sc.rpc("privacy_subject_export")).data as Record<string, unknown[]>;
    expect(r.guest_records).toHaveLength(1);
    expect(r.guest_care).toHaveLength(1);
    expect((r.guest_care[0] as { dietary: string }).dietary).toBe("vegan");
    expect(r.registrations).toHaveLength(1);
    for (const k of ["access_passes", "admissions", "ticket_transfers", "resale_listings", "waiting_rooms", "risk_reviews", "account_holds", "security_events", "consents", "personal_event_briefs"])
      expect(Array.isArray(r[k])).toBe(true);
    const other = (await xc.rpc("privacy_subject_export")).data as Record<string, unknown[]>;
    expect(other.guest_records).toHaveLength(0);
    expect(other.registrations).toHaveLength(0);
    expect((await db.rpc("privacy_subject_export")).error?.message).toBe("not_authorized");
  });

  test("consent history is append-only and the marketing choice reaches the profile", async () => {
    expect((await sc.rpc("record_consent", { p_purpose: "marketing_email", p_granted: true, p_version: "2026-10", p_source: "settings" })).error).toBeNull();
    expect((await db.from("profiles").select("marketing_opt_in").eq("id", S.id).single()).data?.marketing_opt_in).toBe(true);
    expect((await sc.rpc("record_consent", { p_purpose: "marketing_email", p_granted: false, p_version: "2026-10", p_source: "admin" })).error?.message).toBe("invalid_source");
    expect((await sc.rpc("update_my_profile", { p: { notifications: { marketing: false } } })).error).toBeNull();   // deployed settings path
    const mine = ((await sc.rpc("my_consents")).data ?? []) as { purpose: string; granted: boolean }[];
    expect(mine.find(c => c.purpose === "marketing_email")?.granted).toBe(false);
    const history = (await sc.from("consent_records").select("granted,source").eq("purpose", "marketing_email").order("created_at")).data ?? [];
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect((await sc.from("consent_records").update({ granted: true }).eq("user_id", S.id).select("id")).data ?? []).toHaveLength(0);
    expect((await xc.from("consent_records").select("id").eq("user_id", S.id)).data ?? []).toHaveLength(0);
  });

  test("legal hold blocks erasure and purge; release lets erasure run; financial records survive pseudonymously", async () => {
    expect((await xc.rpc("legal_hold_place", { p_matter: "Claim 1", p_reason: "Pending claim", p_subjects: [{ type: "user", id: S.id }] })).error?.message).toBe("not_authorized");
    const h = await ac.rpc("legal_hold_place", { p_matter: "Claim 1", p_reason: "Pending claim against organiser", p_subjects: [{ type: "user", id: S.id }, { type: "event", id: OLD }] });
    expect(h.error).toBeNull(); holds.push(h.data as string);
    expect((await db.rpc("erase_user_data", { p_user: S.id })).error?.message).toBe("legal_hold");
    // Retention purge skips the held event (launch_queue rule: 30 days after the event).
    await db.from("launch_queue").insert({ event_id: OLD, token_hash: "q32" + Date.now(), user_id: X.id });
    await db.rpc("retention_apply", { p_key: "launch_queue.after_event", p_preview: false });
    expect((await db.from("launch_queue").select("user_id").eq("event_id", OLD)).data ?? []).toHaveLength(1);
    expect((await ac.rpc("legal_hold_release", { p_hold: h.data, p_reason: "Claim settled" })).error).toBeNull();
    await db.rpc("retention_apply", { p_key: "launch_queue.after_event", p_preview: false });
    expect((await db.from("launch_queue").select("user_id").eq("event_id", OLD)).data ?? []).toHaveLength(0);
    const m = await db.rpc("erase_user_data", { p_user: S.id });
    expect(m.error).toBeNull();
    expect((await db.from("guests").select("name,email,phone").eq("id", G).single()).data).toEqual({ name: "Deleted guest", email: "", phone: "" });
    expect((await db.from("guest_care").select("guest_id").eq("guest_id", G)).data ?? []).toHaveLength(0);
    expect(((await db.from("registrations").select("answers,email").eq("user_id", S.id).single()).data as { email: string }).email).toMatch(/^erased\+/);
    const order = (await db.from("checkout_orders").select("buyer_id,amount").eq("order_ref", REF).single()).data;
    expect(order).toEqual({ buyer_id: S.id, amount: 10 });   // financial record retained, keyed by an opaque id
    expect(((await db.from("consent_records").select("id").eq("user_id", S.id)).data ?? []).length).toBeGreaterThan(0);
  });

  test("retention schedule: preview and audit are admin-only; legal-review rules can't be enabled without review", async () => {
    expect((await xc.rpc("privacy_retention_preview")).error?.message).toBe("not_authorized");
    const p = await ac.rpc("privacy_retention_preview");
    expect(p.error).toBeNull();
    expect(Object.keys((p.data as { results: object }).results)).toContain("guest_care.after_event");
    expect((await ac.rpc("data_retention_rule_set", { p_key: "guests.after_event", p_enabled: true, p_days: null, p_reason: "try enabling" })).error?.message).toBe("legal_review_required");
    expect((await xc.rpc("data_retention_rule_set", { p_key: "rate_limits.stale", p_enabled: true, p_days: 2, p_reason: "not admin" })).error?.message).toBe("not_authorized");
    const rep = await ac.rpc("privacy_audit_report");
    expect(rep.error).toBeNull();
    const r = rep.data as { tables_total: number; tables_classified: number; unclassified_tables: string[]; legal_review: string };
    expect(r.tables_total).toBeGreaterThan(r.tables_classified);
    expect(r.legal_review).toMatch(/does not certify compliance/);
    expect((await xc.from("data_retention_rules").select("key")).data ?? []).toHaveLength(0);
  });
});
