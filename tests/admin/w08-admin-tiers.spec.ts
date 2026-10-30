import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, signedIn, totp } from "../phase1/helpers";
import { decide, type Window } from "../../src/lib/maintenance";

// W08 (v6 GD-09): admin permission tiers, reason + step-up on sensitive actions, case-scoped break-glass conversation access,
// and the maintenance-mode control path. Disposable admins only (each enrols a TOTP factor through the normal MFA API and works on
// an aal2 session). Mutations target random ids (rejected before any write) or disposable records; the maintenance windows are
// scheduled a year ahead so they never become active, and are removed in afterAll. Q31 S1–S5 fixed by migrations 202610292001/2002.
const db = admin as unknown as SupabaseClient;
const tag = randomBytes(3).toString("hex");
const nil = () => crypto.randomUUID();
type Adm = { id: string; email: string; c: SupabaseClient; secret: string | null };
/** Password sign-in with back-off: the shared project's auth endpoint is rate limited and other lanes sign in too. */
async function login(email: string): Promise<SupabaseClient> {
  for (let i = 0; ; i++) {
    try { return await signedIn(email) as unknown as SupabaseClient; } catch (e) {
      if (i >= 5 || !/rate limit/i.test(String(e))) throw e;
      await new Promise(r => setTimeout(r, 15_000 * (i + 1)));
    }
  }
}

async function mkAdmin(label: string, permissions: string[], mfa = true): Promise<Adm> {
  const u = await createUser(`w08-${label}`, `W08 ${label}`);
  const { error } = await db.from("platform_admins").insert({ user_id: u.id, title: `W08 ${label} ${tag}`, permissions });
  if (error) throw error;
  const c = await login(u.email);
  let secret: string | null = null;
  if (mfa) {
    const { data: f, error: fe } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `w08-${tag}` });
    if (fe || !f) throw fe;
    secret = f.totp.secret;
    const { data: ch } = await c.auth.mfa.challenge({ factorId: f.id });
    const { error: ve } = await c.auth.mfa.verify({ factorId: f.id, challengeId: ch!.id, code: totp(secret) });
    if (ve) throw ve;
  }
  return { ...u, c, secret };
}
const code = (e: { message?: string; code?: string } | null) => e?.message ?? "";

test.describe.configure({ mode: "serial" });
test.describe("W08 platform admin", () => {
  let sup: Adm, com: Adm, par: Adm, set: Adm, bg: Adm, bare: Adm;
  let member: { id: string; email: string }, other: { id: string; email: string };
  let conv: string, convOut: string, caseId: string;
  const windows: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    sup = await mkAdmin("support", ["support"]); com = await mkAdmin("commerce", ["commerce"]); par = await mkAdmin("partners", ["partners"]);
    set = await mkAdmin("settings", ["settings"]); bg = await mkAdmin("breakglass", ["support", "support.break_glass_conversation.read"]);
    bare = await mkAdmin("nofactor", ["settings", "users"], false);
    [member, other] = await Promise.all([createUser("w08-member", "W08 Member"), createUser("w08-other", "W08 Other")]);
    const mkConv = async (subject: string, users: string[]) => {
      const id = ((await db.from("conversations").insert({ kind: "direct", subject, created_by: users[0] }).select("id").single()).data as { id: string }).id;
      await db.from("conversation_participants").insert(users.map(u => ({ conversation_id: id, user_id: u })));
      await db.from("conversation_messages").insert({ conversation_id: id, sender_id: users[0], sender_name: "W08", body: `W08 private body ${tag}` });
      return id;
    };
    [conv, convOut] = await Promise.all([mkConv(`W08 in scope ${tag}`, [member.id, other.id]), mkConv(`W08 out of scope ${tag}`, [other.id])]);
    caseId = ((await db.from("support_cases").insert({ reference: `W08-${tag}`, subject: `W08 safeguarding ${tag}`, category: "other", requester_id: member.id, status: "open" }).select("id").single()).data as { id: string }).id;
  });

  test.afterAll(async () => {
    const admins = [sup, com, par, set, bg, bare].filter(Boolean).map(a => a.id);
    const { data: grants } = await db.from("break_glass_grants").select("id").in("requester_id", admins);
    const gids = (grants ?? []).map(g => (g as { id: string }).id);
    if (gids.length) { await db.from("break_glass_access_log").delete().in("grant_id", gids); await db.from("break_glass_grants").delete().in("id", gids); }
    if (windows.length) await db.from("maintenance_windows").delete().in("id", windows);
    await db.from("maintenance_windows").delete().like("reference", `W08-${tag}%`);
    await db.from("audit_events").delete().in("actor_id", admins);
    if (caseId) await db.from("support_cases").delete().eq("id", caseId);
    await db.from("conversations").delete().in("id", [conv, convOut].filter(Boolean));
    await db.from("platform_admins").delete().in("user_id", admins);
    await cleanup();
  });

  // ── Permission tiers ───────────────────────────────────────────────────────
  const actions: [string, string, (r: string) => Record<string, unknown>][] = [
    ["users", "admin_set_user_status", r => ({ p_user: nil(), p_status: "restricted", p_reason: r })],
    ["workspaces", "admin_set_workspace_status", r => ({ p_ws: nil(), p_status: "suspended", p_reason: r })],
    ["tickets", "admin_set_ticket_sales", r => ({ p_event: nil(), p_pause: true, p_reason: r })],
    ["marketplace", "admin_review_listing", r => ({ p_listing: nil(), p_decision: "suspend", p_reason: r })],
    ["trust", "admin_decide_trust", r => ({ p_case: nil(), p_decision: "actioned", p_reason: r })],
    ["support", "admin_update_case", r => ({ p_case: nil(), p_status: "escalated", p_reason: r })],
    ["events", "admin_set_event_featured", r => ({ p_event: nil(), p_featured: false, p_reason: r })],
    ["partners", "admin_set_partner_terms", r => ({ p_partner: nil(), p_commission_bps: 100, p_reason: r })],
  ];
  test("each admin can act only in their own area (others get not_authorized before any write)", async () => {
    const who: [string, Adm][] = [["support", sup], ["commerce", com], ["partners", par]];
    const matrix: string[] = [];
    for (const [perm, a] of who) for (const [area, fn, args] of actions) {
      const { error } = await a.c.rpc(fn, args("W08 permission tier check"));
      matrix.push(`${perm}→${area}: ${code(error)}`);
      if (perm === area) expect(code(error), `${perm} on ${fn}`).toContain("not_found");          // allowed; random id → nothing to change
      else expect(code(error), `${perm} on ${fn}`).toContain("not_authorized");
    }
    test.info().annotations.push({ type: "matrix", description: matrix.join(" | ") });
  });

  test("sensitive actions need a written reason", async () => {
    expect(code((await sup.c.rpc("admin_update_case", { p_case: nil(), p_status: "escalated", p_reason: "" })).error)).toContain("reason_required");
    expect(code((await par.c.rpc("admin_set_partner_terms", { p_partner: nil(), p_commission_bps: 100, p_reason: "ok" })).error)).toContain("reason_required");
  });

  test("an admin with a verified factor on a password-only (aal1) session is refused (require_step_up)", async () => {
    const aal1 = await login(sup.email);
    expect(code((await aal1.rpc("admin_update_case", { p_case: nil(), p_status: "escalated", p_reason: "W08 step-up check" })).error)).toContain("step_up_required");
  });

  test("an admin with no MFA factor cannot call admin mutations on aal1 (admin_require and permission-only mutations)", async () => {
    expect(code((await bare.c.rpc("admin_set_user_status", { p_user: nil(), p_status: "restricted", p_reason: "W08 no factor" })).error)).toContain("step_up_required");
    expect(code((await bare.c.rpc("admin_save_setting_draft", { p_section: `w08_${tag}`, p_value: {}, p_summary: "W08 no factor" })).error)).toContain("step_up_required");
    // A non-admin still gets not_authorized (the MFA gate applies to platform admins only).
    expect(code((await (await login(member.email)).rpc("admin_save_setting_draft", { p_section: `w08_${tag}`, p_value: {}, p_summary: "W08 member" })).error)).toContain("not_authorized");
  });

  test("read tiers: each admin reads only its own area's tables", async () => {
    const n = async (c: SupabaseClient, t: string) => (await c.from(t).select("*", { count: "exact", head: true })).count ?? 0;
    expect(await n(sup.c, "support_cases")).toBeGreaterThan(0);
    expect(await n(com.c, "support_cases")).toBe(0);
    expect(await n(com.c, "transactions")).toBeGreaterThan(0);
    expect(await n(sup.c, "transactions")).toBe(0);
    expect(await n(par.c, "partners")).toBeGreaterThan(0);
    expect(await n(sup.c, "partners")).toBe(0);
    expect(await n(com.c, "checkout_orders")).toBeGreaterThan(0);
    expect(await n(par.c, "checkout_orders")).toBe(0);
    // Own security events are visible to their actor; everyone else's need the 'audit' permission.
    for (const a of [sup, com, par, set]) expect((await a.c.from("audit_events").select("id", { count: "exact", head: true }).neq("actor_id", a.id)).count ?? 0, "audit needs the audit permission").toBe(0);
  });

  test("platform_admins: own row only unless the admin holds users or settings (S5)", async () => {
    for (const a of [sup, com, par, bg]) expect(((await a.c.from("platform_admins").select("user_id")).data ?? []).map(r => (r as { user_id: string }).user_id), "own row only").toEqual([a.id]);
    expect(((await set.c.from("platform_admins").select("user_id")).data ?? []).length).toBeGreaterThan(1);
    // The break-glass request page gets a count of other approvers, not identities.
    expect(typeof (await bg.c.rpc("admin_break_glass_approvers")).data).toBe("number");
    expect(code((await sup.c.rpc("admin_break_glass_approvers")).error)).toContain("forbidden");
  });

  test("admin_set_partner_status refuses an unknown id without writing an audit event (S5)", async () => {
    const ghost = nil();
    expect(code((await par.c.rpc("admin_set_partner_status", { p_partner: ghost, p_status: "paused", p_reason: "W08 unknown partner" })).error)).toContain("not_found");
    expect((await db.from("audit_events").select("id").eq("actor_id", par.id).contains("metadata", { partner_id: ghost })).data ?? []).toEqual([]);
  });

  test("other grant paths: agent credits need agent_ops; settings publish needs settings", async () => {
    expect(code((await com.c.rpc("admin_grant_credits", { p_workspace: nil(), p_credits: 1, p_kind: "grant", p_reference: "W08 tier" })).error)).toContain("not_authorized");
    expect(code((await sup.c.rpc("admin_publish_setting", { p_section: `w08_${tag}`, p_value: {}, p_reason: "W08 tier check" })).error)).toContain("not_authorized");
  });

  // ── Conversations: no blanket read path ────────────────────────────────────
  test("no admin can read member conversations directly or through the retired review RPCs", async () => {
    for (const a of [sup, com, par, set, bg]) {
      expect((await a.c.from("conversation_messages").select("id").eq("conversation_id", conv)).data ?? []).toEqual([]);
      expect((await a.c.from("conversations").select("id").eq("id", conv)).data ?? []).toEqual([]);
    }
    expect((await sup.c.rpc("admin_open_conversation", { p_conv: conv, p_reason: "W08 blanket read attempt" })).error).not.toBeNull();
    expect((await sup.c.rpc("admin_list_conversations", { p_q: "", p_kind: "", p_limit: 50, p_offset: 0 })).error).not.toBeNull();
    expect(code((await sup.c.rpc("admin_case_conversations", { p_case_type: "support", p_case: caseId })).error)).toContain("forbidden");
  });

  test("break-glass: case-scoped, justified, time-limited, logged; out-of-scope and expired access refused", async () => {
    const c = bg.c;
    const listed = (await c.rpc("admin_case_conversations", { p_case_type: "support", p_case: caseId })).data as { conversations: { id: string }[] };
    expect(listed.conversations.map(x => x.id)).toEqual([conv]);                      // only the case member's conversations
    expect(code((await c.rpc("admin_request_break_glass", { p_case_type: "support", p_case: caseId, p_reason: "critical_support", p_justification: "short", p_conversations: [conv], p_minutes: 15 })).error)).toContain("justification_required");
    expect(code((await c.rpc("admin_request_break_glass", { p_case_type: "support", p_case: caseId, p_reason: "critical_support", p_justification: "W08 test: member reported a safety concern in this thread", p_conversations: [convOut], p_minutes: 15 })).error)).toContain("conversation_out_of_scope");
    const { data: g, error } = await c.rpc("admin_request_break_glass", { p_case_type: "support", p_case: caseId, p_reason: "critical_support", p_justification: "W08 test: member reported a safety concern in this thread", p_conversations: [conv], p_minutes: 15 });
    expect(error).toBeNull();
    const grant = (g as { id: string; status: string }).id;
    expect((g as { status: string }).status).toBe("active");
    expect(code((await sup.c.rpc("admin_open_conversation", { p_grant: grant, p_conv: conv })).error)).toMatch(/forbidden|no_grant/);   // someone else's grant
    expect(code((await c.rpc("admin_open_conversation", { p_grant: grant, p_conv: convOut })).error)).toContain("conversation_out_of_scope");
    const opened = (await c.rpc("admin_open_conversation", { p_grant: grant, p_conv: conv })).data as { log_id: string; messages: { body: string }[] };
    expect(opened.messages[0]!.body).toBe(`W08 private body ${tag}`);
    expect((await db.from("break_glass_access_log").select("id").eq("grant_id", grant)).data).toHaveLength(1);
    expect(((await db.from("audit_events").select("event").eq("actor_id", bg.id)).data ?? []).map(r => (r as { event: string }).event))
      .toEqual(expect.arrayContaining(["admin.break_glass_requested", "admin.break_glass_conversation_opened"]));
    await db.from("break_glass_grants").update({ expires_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", grant);   // well past, whatever the local-vs-DB clock skew
    expect(code((await c.rpc("admin_open_conversation", { p_grant: grant, p_conv: conv })).error)).toContain("grant_not_active");
  });

  test("support admins cannot read message previews through the email outbox", async () => {
    const { count } = await sup.c.from("email_outbox").select("id", { count: "exact", head: true }).eq("category", "messages");
    expect(count ?? 0).toBe(0);
    for (const a of [sup, set, bg]) expect((await a.c.from("email_outbox").select("id").limit(5)).data ?? []).toEqual([]);
  });

  test("email: admins see delivery metadata only; message emails carry no message text; bodies only via an active break-glass grant", async () => {
    // A message notification for the case member: its email has no message text.
    const secret = `W08 secret message text ${tag}`;
    const { data: n } = await db.from("notifications").insert({ user_id: member.id, kind: "message", title: "New message from W08", body: secret, link: `/messages/${conv}` }).select("id").single();
    const nid = (n as { id: string }).id;
    const mail = (await db.from("email_outbox").select("id,body,category").eq("notification_id", nid).single()).data as { id: string; body: string; category: string };
    try {
      expect(mail.category).toBe("messages");
      expect(mail.body).not.toContain(secret);
      expect(mail.body).toMatch(/inbox/i);
      // Metadata RPC: no subject/body/link columns; refused for admins without support/settings/agent_ops.
      const rows = (await sup.c.rpc("admin_email_deliveries", { p_user: member.id, p_limit: 10 })).data as Record<string, unknown>[];
      expect(rows.map(r => r.id)).toContain(mail.id);
      for (const r of rows) for (const k of ["body", "subject", "link"]) expect(r, k).not.toHaveProperty(k);
      expect(code((await com.c.rpc("admin_email_deliveries", { p_limit: 1 })).error)).toContain("not_authorized");
      expect(typeof ((await set.c.rpc("admin_email_backlog")).data as { queued: number }).queued).toBe("number");
      // Break-glass: no permission / unknown grant refused; an active grant on the member's case returns the body, audited.
      expect(code((await sup.c.rpc("admin_open_email", { p_grant: nil(), p_email: mail.id })).error)).toContain("forbidden");
      expect(code((await bg.c.rpc("admin_open_email", { p_grant: nil(), p_email: mail.id })).error)).toContain("no_grant");
      const { data: g, error } = await bg.c.rpc("admin_request_break_glass", { p_case_type: "support", p_case: caseId, p_reason: "critical_support", p_justification: "W08 test: member reported a delivery problem with this email", p_conversations: [conv], p_minutes: 15 });
      expect(error).toBeNull();
      const grant = (g as { id: string }).id;
      const opened = (await bg.c.rpc("admin_open_email", { p_grant: grant, p_email: mail.id })).data as { body: string };
      expect(opened.body).toBe(mail.body);
      const outsider = await createUser("w08-outsider");                    // not on the case nor in its conversations
      const otherMail = ((await db.from("email_outbox").insert({ user_id: outsider.id, to_email: outsider.email, category: "quotes", subject: "W08", body: "W08 other", status: "suppressed" }).select("id").single()).data as { id: string }).id;
      try { expect(code((await bg.c.rpc("admin_open_email", { p_grant: grant, p_email: otherMail })).error)).toContain("email_out_of_scope"); }
      finally { await db.from("email_outbox").delete().eq("id", otherMail); }
      expect(((await db.from("audit_events").select("event").eq("actor_id", bg.id)).data ?? []).map(r => (r as { event: string }).event)).toContain("admin.break_glass_email_opened");
    } finally {
      await db.from("email_outbox").delete().eq("notification_id", nid);
      await db.from("notifications").delete().eq("id", nid);
    }
  });

  // ── Maintenance mode (API level; nothing becomes active) ───────────────────
  const future = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
  test("maintenance: settings admin schedules and ends a window, audited; it is never active; other admins refused", async () => {
    const before = (await anon().rpc("maintenance_level", { p_module: "resale" })).data;
    const { data: id, error } = await set.c.rpc("start_maintenance", { p: { level: 2, modules: ["resale"], title: `W08 ${tag}`, audience: "admins", starts_at: future(365), ends_at: future(365.04), reference: `W08-${tag}` } });
    expect(error).toBeNull(); windows.push(id as string);
    expect(((await anon().rpc("maintenance_state")).data as { id: string }[]).some(w => w.id === id)).toBe(false);
    expect((await anon().rpc("maintenance_level", { p_module: "resale" })).data).toBe(before);
    expect(code((await sup.c.rpc("start_maintenance", { p: { level: 1, title: "nope", starts_at: future(365) } })).error)).toContain("not_authorized");
    expect(code((await sup.c.rpc("end_maintenance", { p_window: id, p_note: "nope" })).error)).toContain("not_authorized");
    expect((await set.c.rpc("end_maintenance", { p_window: id, p_note: "W08 cleanup" })).error).toBeNull();
    expect(((await db.from("maintenance_windows").select("ended_at").eq("id", id).single()).data as { ended_at: string | null }).ended_at).not.toBeNull();
    const ev = ((await db.from("audit_events").select("event").eq("actor_id", set.id)).data ?? []).map(r => (r as { event: string }).event);
    expect(ev).toEqual(expect.arrayContaining(["maintenance.started", "maintenance.ended"]));
  });

  test("maintenance: M4/M5 need a fresh second factor", async () => {
    const aal1 = await login(set.email);
    expect(code((await aal1.rpc("start_maintenance", { p: { level: 4, title: `W08 ${tag}`, starts_at: future(365), reference: `W08-${tag}-m4` } })).error)).toContain("step_up_required");
  });

  test("maintenance: starting/ending a window requires a reason and step-up like other admin mutations", async () => {
    const { data: id, error } = await bare.c.rpc("start_maintenance", { p: { level: 1, title: `W08 ${tag}`, starts_at: future(365), reference: `W08-${tag}-bare` } });
    if (id) windows.push(id as string);
    expect(code(error)).toContain("step_up_required");
    // A payload with the reason key must carry a real reason (the legacy keyless payload is audited with legacy_reason=true).
    expect(code((await set.c.rpc("start_maintenance", { p: { level: 1, title: `W08 ${tag}`, reason: "", starts_at: future(365), reference: `W08-${tag}-nr` } })).error)).toContain("reason_required");
    const { data: w2, error: e2 } = await set.c.rpc("start_maintenance", { p: { level: 1, title: `W08 ${tag}`, reason: "W08 reason check", audience: "admins", starts_at: future(365), ends_at: future(365.01), reference: `W08-${tag}-r` } });
    expect(e2).toBeNull(); windows.push(w2 as string);
    expect(code((await set.c.rpc("end_maintenance", { p_window: w2, p_note: "" })).error)).toContain("reason_required");
    expect(code((await set.c.rpc("start_maintenance", { p: { level: 1, title: `W08 ${tag}`, reason: "W08 qa audience", audience: "qa", starts_at: future(365), reference: `W08-${tag}-qa` } })).error)).toContain("invalid_audience");
    expect((await set.c.rpc("end_maintenance", { p_window: w2, p_note: "W08 cleanup with reason" })).error).toBeNull();
    const meta = ((await db.from("audit_events").select("metadata").eq("actor_id", set.id).eq("event", "maintenance.started")).data ?? []).map(r => (r as { metadata: { reason?: string } }).metadata.reason);
    expect(meta).toContain("W08 reason check");
  });

  test("maintenance enforcement honours the window's audience (an organizer-only window does not freeze customers)", async () => {
    const w: Window = { id: "w", level: 3, modules: [], title: "M3", message: "", status_url: null, expected_restore: null, audience: "organizers", dismissible: false, severity: "warning", bypass_roles: [], reference: "", starts_at: new Date().toISOString(), ends_at: null };
    expect(decide([w], "/account/events/e1", "POST").action).toBe("allow");
    expect(decide([w], "/organizer/events/e1", "POST").action).toBe("deny");
    expect(decide([w], "/api/checkout/session", "POST").action).toBe("allow");
    expect(decide([{ ...w, audience: "customers" }], "/organizer/events/e1", "POST").action).toBe("allow");
    expect(decide([{ ...w, audience: "customers" }], "/api/checkout/session", "POST").action).toBe("deny");
    expect(decide([w], "/api/messages", "POST", ["organizers"]).action).toBe("deny");   // explicit viewer audiences win
  });

  test("maintenance enforcement: checkout window blocks payment writes safely, leaves tickets and admin up", async () => {
    const w: Window = { id: "w", level: 2, modules: ["checkout"], title: "Checkout paused", message: "", status_url: null, expected_restore: null, audience: "all", dismissible: false, severity: "warning", bypass_roles: [], reference: "", starts_at: new Date().toISOString(), ends_at: null };
    expect(decide([w], "/api/checkout/session", "POST").action).toBe("deny");
    expect(decide([w], "/checkout/neon-nights", "GET").action).toBe("page");
    expect(decide([w], "/account/tickets/t1", "GET").action).toBe("allow");
    expect(decide([w], "/admin/maintenance", "POST").action).toBe("allow");
    expect(decide([w], "/api/stripe/webhook", "POST").action).toBe("allow");
    expect(decide([], "/api/checkout/session", "POST").action).toBe("allow");     // recovery: window ended → allowed
  });
});
