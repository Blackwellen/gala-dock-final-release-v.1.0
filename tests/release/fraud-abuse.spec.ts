// Q33 · Fraud / abuse — API-level, disposable identities, no browser, no Stripe, no emails to real people.
// Exit gate: the risk system never silently makes irreversible decisions outside configured policy.
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, enrolTotp, PASSWORD, seedWorkspace, signedIn } from "../phase1/helpers";

const db = admin as unknown as SupabaseClient;
type U = { id: string; email: string };
test.describe.configure({ mode: "serial" });

test.describe("Q33 fraud / abuse", () => {
  let S: U, R: U, A: U, N: U, P: U; let W = "", EV = "", L = "", PR = "", PO = ""; const refs: string[] = [];
  let sc: SupabaseClient, rc: SupabaseClient, ac: SupabaseClient, nc: SupabaseClient;
  const as = async (u: U, pw = PASSWORD) => (await signedIn(u.email, pw)) as unknown as SupabaseClient;
  const signals = async (filter: (q: ReturnType<SupabaseClient["from"]>) => unknown) =>
    ((await (filter(db.from("risk_signals")) as PromiseLike<{ data: unknown }>)).data ?? []) as { id: string; kind: string; status: string; severity: string; evidence: Record<string, unknown> }[];

  test.beforeAll(async () => {
    [S, R, A, N, P] = await Promise.all([createUser("q33-subject"), createUser("q33-recipient"), createUser("q33-admin"), createUser("q33-nonadmin"), createUser("q33-promoter")]);
    W = await seedWorkspace(S.id, "provider", "Q33 Subject Co");
    await db.from("platform_admins").insert({ user_id: A.id, title: "Q33 trust admin", permissions: ["trust"] });
    await db.from("listings").insert({ workspace_id: W, name: "Q33 Hall", kind: "venue", published: true, review_status: "approved", description: "A plain listing." });
    EV = ((await db.from("events").insert({ owner_id: S.id, name: "Q33 Party", starts_at: new Date(Date.now() + 9 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
    [sc, rc, ac, nc] = await Promise.all([as(S), as(R), as(A), as(N)]);
    await enrolTotp(ac as never);
  });

  test.afterAll(async () => {
    const subjects = [S, R, A, N, P].map(u => u.id);
    await db.from("risk_holds").delete().in("subject_id", [...subjects, W]);
    await db.from("risk_signals").delete().or(`user_id.in.(${subjects.join(",")}),workspace_id.eq.${W}`);
    await db.from("trust_cases").delete().in("subject_id", [...subjects, W]);
    if (PO) await db.from("promoter_payouts").delete().eq("id", PO);
    if (PR) await db.from("promoters").delete().eq("id", PR);
    for (const r of refs) await db.from("checkout_orders").delete().eq("order_ref", r);
    await db.from("listings").delete().eq("workspace_id", W);
    await db.from("events").delete().eq("id", EV);
    await db.from("workspaces").delete().eq("id", W);
    await db.from("platform_admins").delete().eq("user_id", A.id);
    await db.from("account_security_events").delete().in("user_id", subjects);
    await cleanup();
  });

  test("off-platform payment message is flagged, still delivered, and the flag is admin-only", async () => {
    const { data: conv, error } = await rc.rpc("start_conversation", { p_kind: "enquiry", p_subject: "Q33 booking", p_to_type: "workspace", p_to: W,
      p_body: "Skip the fees — pay me by bank transfer, sort code 12-34-56." });
    expect(error).toBeNull();
    const delivered = await sc.from("conversation_messages").select("id,body").eq("conversation_id", conv as string);
    expect(delivered.data?.length).toBe(1);
    const flagged = await signals(q => q.select("id,kind,status,severity,evidence").eq("user_id", R.id).eq("kind", "off_platform_payment"));
    expect(flagged).toHaveLength(1);
    expect(flagged[0].severity).toBe("review");
    expect(JSON.stringify(flagged[0].evidence)).not.toContain("sort code");   // pattern ids only, never the message text
    for (const c of [sc, rc, nc]) expect((await c.from("risk_signals").select("id")).data ?? []).toHaveLength(0);
    expect((await ac.from("risk_signals").select("id").eq("id", flagged[0].id)).data).toHaveLength(1);
  });

  test("listing signal: admin decisions need trust + MFA + reason, are audited and reversible", async () => {
    L = ((await db.from("listings").insert({ workspace_id: W, name: "Q33 DJ", kind: "service", published: true,
      description: "Message me on whatsapp or q33dj@example.invalid to book direct." }).select("id").single()).data as { id: string }).id;
    const [sig] = await signals(q => q.select("id,kind,status,severity,evidence").eq("subject_id", L).eq("kind", "contact_in_description"));
    expect(sig?.status).toBe("open");
    expect((await nc.rpc("risk_signal_decide", { p_signal: sig.id, p_decision: "clear", p_reason: "not an admin" })).error?.message).toBe("not_authorized");
    expect((await ac.rpc("risk_signal_decide", { p_signal: sig.id, p_decision: "clear", p_reason: "" })).error?.message).toBe("reason_required");
    expect((await ac.rpc("risk_signal_decide", { p_signal: sig.id, p_decision: "action", p_reason: "Asked provider to remove contact details" })).error).toBeNull();
    expect((await ac.rpc("risk_signal_decide", { p_signal: sig.id, p_decision: "clear", p_reason: "Provider removed details" })).error).toBeNull();
    const esc = await ac.rpc("risk_signal_decide", { p_signal: sig.id, p_decision: "escalate", p_reason: "Repeat behaviour, open a case" });
    expect(esc.error).toBeNull();
    expect((esc.data as { case_id: string }).case_id).toBeTruthy();
    const audit = await db.from("audit_events").select("metadata").eq("event", "risk.signal_reviewed").eq("actor_id", A.id);
    expect((audit.data ?? []).filter(a => (a.metadata as { signal_id: string }).signal_id === sig.id)).toHaveLength(3);
    // The listing itself was never hidden or unpublished by the detector.
    expect((await db.from("listings").select("published").eq("id", L).single()).data?.published).toBe(true);
  });

  test("account takeover pattern → visible step-up + payout holds; appeal; admin overturns", async () => {
    expect((await db.rpc("risk_security_event", { p_user: S.id, p_kind: "new_device", p_context: { test: true } })).error).toBeNull();
    const NEWPW = PASSWORD + "x";
    expect((await admin.auth.admin.updateUserById(S.id, { password: NEWPW })).error).toBeNull();   // real auth.users trigger
    const r = await db.rpc("risk_security_event", { p_user: S.id, p_kind: "payout_changed", p_context: { test: true } });
    expect((r.data as { takeover: boolean }).takeover).toBe(true);
    sc = await as(S, NEWPW);
    const holds = ((await sc.rpc("my_risk_holds")).data ?? []) as { id: string; kind: string; subject_type: string; reason: string }[];
    expect(holds.map(h => `${h.kind}:${h.subject_type}`).sort()).toEqual(["payout:user", "payout:workspace", "step_up:user"]);
    expect(holds.every(h => h.reason.length > 10 && !/threshold|window_hours/.test(h.reason))).toBe(true);
    const note = await db.from("notifications").select("title").eq("user_id", S.id).ilike("title", "%security review%");
    expect(note.data?.length).toBeGreaterThan(0);   // never silent
    expect((await db.rpc("payout_eligible", { p_workspace: W })).data).toBe(false);
    // Step-up hold: a sensitive command refuses an aal1 session without a factor.
    const key = await sc.rpc("create_api_key", { p_workspace: W, p_name: "q33", p_scopes: ["events:read"], p_prefix: "gd_q33", p_hash: "x".repeat(64), p_expires: null });
    expect(key.error?.message).toBe("account_review_hold");
    // Appeal once; strangers can't see or appeal it.
    const stepUp = holds.find(h => h.kind === "step_up")!;
    expect((await rc.rpc("risk_hold_appeal", { p_hold: stepUp.id, p_statement: "This is not my account but let me appeal anyway." })).error?.message).toBe("not_found");
    const appeal = await sc.rpc("risk_hold_appeal", { p_hold: stepUp.id, p_statement: "It was me: new phone, new password and new bank." });
    expect(appeal.error).toBeNull();
    expect((await sc.rpc("risk_hold_appeal", { p_hold: stepUp.id, p_statement: "It was me: new phone, new password and new bank." })).error?.message).toBe("already_appealed");
    expect((await ac.rpc("risk_appeal_decide", { p_case: appeal.data, p_outcome: "overturned", p_reason: "Owner verified by phone" })).error).toBeNull();
    const after = ((await sc.rpc("my_risk_holds")).data ?? []) as { kind: string; status: string }[];
    expect(after.find(h => h.kind === "step_up")?.status).toBe("released");
    expect((await sc.rpc("create_api_key", { p_workspace: W, p_name: "q33", p_scopes: ["events:read"], p_prefix: "gd_q33", p_hash: "x".repeat(64), p_expires: null })).error?.message).not.toBe("account_review_hold");
    // Payout holds stay until an admin releases them (reason + MFA), then payouts are eligible again on hold grounds.
    for (const h of ((await ac.from("risk_holds").select("id").in("subject_id", [S.id, W]).eq("status", "active")).data ?? []) as { id: string }[])
      expect((await ac.rpc("risk_hold_release", { p_hold: h.id, p_reason: "Owner verified by phone" })).error).toBeNull();
    expect((await db.rpc("risk_hold_active", { p_kind: "payout", p_subject_type: "workspace", p_subject_id: W })).data).toBe(false);
  });

  test("payout hold blocks a promoter payout release without moving money, and lifts cleanly", async () => {
    PR = ((await db.from("promoters").insert({ event_id: EV, name: "Q33 promoter", code: "Q33" + Date.now().toString(36).toUpperCase(), commission_pct: 10, user_id: P.id }).select("id").single()).data as { id: string }).id;
    PO = ((await db.from("promoter_payouts").insert({ promoter_id: PR, amount: 0, status: "held", scheduled_for: new Date().toISOString().slice(0, 10), gross_commission: 0, locked_at: new Date().toISOString() }).select("id").single()).data as { id: string }).id;
    expect((await nc.rpc("risk_hold_place", { p_kind: "payout", p_subject_type: "user", p_subject_id: P.id, p_reason: "not an admin" })).error?.message).toBe("not_authorized");
    const hold = await ac.rpc("risk_hold_place", { p_kind: "payout", p_subject_type: "user", p_subject_id: P.id, p_reason: "Unusual commission pattern" });
    expect(hold.error).toBeNull();
    const blocked = await db.from("promoter_payouts").update({ status: "payable" }).eq("id", PO);
    expect(blocked.error?.message).toBe("payout_hold_active");
    expect((await db.from("promoter_payouts").select("status,amount").eq("id", PO).single()).data).toEqual({ status: "held", amount: 0 });
    expect((await ac.rpc("risk_hold_release", { p_hold: hold.data, p_reason: "Pattern explained" })).error).toBeNull();
    expect((await db.from("promoter_payouts").update({ status: "payable" }).eq("id", PO)).error).toBeNull();
  });

  test("ticket chargeback: dispute webhook retries raise exactly one flag and one payment signal", async () => {
    const ref = "GD-Q33CB" + Date.now().toString(36).toUpperCase(); refs.push(ref);
    expect((await db.from("checkout_orders").insert({ order_ref: ref, event_id: EV, buyer_id: R.id, token: "q33" + ref, amount: 20, fee: 1, status: "issued", stripe_session: "cs_test_" + ref, lines: [] })).error).toBeNull();
    for (const status of ["needs_response", "needs_response", "under_review"]) {
      const r = await db.rpc("ticket_order_dispute", { p_ref: ref, p_dispute: "dp_test_q33", p_status: status });
      expect(r.error).toBeNull();
      expect((r.data as { state: string }).state).toBe("chargeback");
    }
    expect(((await db.from("ticket_risk_flags").select("id").eq("order_ref", ref).eq("kind", "chargeback")).data ?? [])).toHaveLength(1);
    const sig = await signals(q => q.select("id,kind,status,severity,evidence").eq("subject_id", ref).eq("domain", "payment"));
    expect(sig).toHaveLength(1);
    const won = await db.rpc("ticket_order_dispute", { p_ref: ref, p_dispute: "dp_test_q33", p_status: "won" });
    expect((won.data as { state: string }).state).toBe("issued");
    await db.from("ticket_risk_flags").delete().eq("order_ref", ref);
  });
});
