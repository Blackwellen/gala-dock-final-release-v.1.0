// Q33 fraud & abuse + Q32 privacy for demo identities. Real commands throughout:
//   * signals through risk_raise (the service-only entry every detector uses; idempotent per dedupe key) across message, review,
//     listing, promotion, provider, account and payout domains, then reviewed by the platform-admin demo (trust + aal2) with
//     risk_signal_decide: some left open, one cleared, one actioned, one escalated (opens a fraud case);
//   * a payout hold on Northern Crew Agency (linked to the escalated signal) and a step-up hold on the agency staff login
//     (agency.staff.demo — never the demo organiser, whose API key flow must keep working), both via risk_hold_place; the staff
//     member appeals the step-up hold (risk_hold_appeal), left open for the admin queue;
//   * a legal hold on the demo workspace "Urban Events" (legal_hold_place: privacy/audit admin, MFA, reason);
//   * retention-run history: retention_sweep_run(preview = true) only — nothing is deleted;
//   * consent history: record_consent by demo customers/members (settings / cookie banner / signup sources).
// Evidence is descriptive demo text only (no message bodies, no personal data).
import { sql } from "./lib.mjs";
import { service, signIn, call } from "./auth.mjs";

const q1 = async q => (await sql(q))[0];
const uid = async e => (await q1(`select id from auth.users where email = '${e}'`)).id;
const wsId = async (name, owner) => (await q1(`select id from public.workspaces where name = '${name}' and owner_id = (select id from auth.users where email = '${owner}') limit 1`)).id;

export async function run() {
  const out = { signals: 0, cleared: 0, actioned: 0, escalated: 0, payout_holds: 0, step_up_holds: 0, appeals: 0, legal_holds: 0, retention_previews: 0, consents: 0 };
  const admin = await signIn("admin.demo@example.com");
  const crew = await wsId("Northern Crew Agency", "agency.demo@example.com"), premier = await wsId("Premier Event Services", "provider.demo@example.com");
  const alexEv = await wsId("Alex Events", "alex.events@example.com");
  const lst = async s => (await q1(`select id from public.listings where slug = '${s}'`)).id;
  const SIGNALS = [
    // key, domain, kind, subject_type, subject_id, severity, score, evidence, user, workspace, decision
    ["q38-demo-msg-1", "message", "off_platform_payment", "workspace", crew, "review", 55, { pattern_ids: ["bank_transfer_request"], conversations: 1 }, null, crew, null],
    ["q38-demo-review-1", "review", "review_velocity", "listing", await lst("gourmet-catering-co"), "review", 40, { reviews_24h: 5, window: "24h" }, null, premier, "clear"],
    ["q38-demo-listing-1", "listing", "contact_in_description", "listing", await lst("city-transport"), "review", 35, { found: ["phone_number_pattern"] }, null, premier, "action"],
    ["q38-demo-promo-1", "promotion", "shared_client_code", "code", "SUNSET10", "info", 25, { accounts: 4, window: "24h" }, null, alexEv, null],
    ["q38-demo-provider-1", "provider", "new_workspace_burst", "workspace", crew, "info", 20, { listings_created_24h: 3 }, null, crew, null],
    ["q38-demo-payout-1", "payout", "payout_destination_changed", "workspace", crew, "hold", 75, { change: "payout bank account changed twice in 48h" }, null, crew, "escalate"],
    ["q38-demo-account-1", "account", "account_takeover", "user", await uid("agency.staff.demo@example.com"), "hold", 70, { new_device: true, password_changed: true }, await uid("agency.staff.demo@example.com"), crew, null],
  ];
  const ids = {};
  for (const [key, domain, kind, st, sid, severity, score, evidence, user, ws, decision] of SIGNALS) {
    let s = await q1(`select id, status, case_id from public.risk_signals where dedupe_key = '${key}'`);
    if (!s) {
      await call(service, "risk_raise", { p_domain: domain, p_kind: kind, p_subject_type: st, p_subject_id: String(sid), p_severity: severity, p_dedupe: key, p_evidence: { ...evidence, demo_seed: "depth-pass2" },
        p_user: user, p_workspace: ws, p_event: null, p_score: score, p_source: "rule", p_rule: null });
      s = await q1(`select id, status, case_id from public.risk_signals where dedupe_key = '${key}'`); out.signals++;
    }
    ids[key] = s.id;
    if (decision && s.status === "open" && !s.case_id) {
      const reason = { clear: "Five genuine reviews after a wedding fair; reviewers verified.", action: "Asked the provider to remove the phone number from the listing.", escalate: "Repeated payout changes: open a fraud case." }[decision];
      await call(admin, "risk_signal_decide", { p_signal: s.id, p_decision: decision, p_reason: reason });
      out[{ clear: "cleared", action: "actioned", escalate: "escalated" }[decision]]++;
    }
  }
  // Holds.
  if (!(await q1(`select count(*)::int n from public.risk_holds where kind = 'payout' and subject_type = 'workspace' and subject_id = '${crew}' and signal_id = '${ids["q38-demo-payout-1"]}'`)).n) {
    await call(admin, "risk_hold_place", { p_kind: "payout", p_subject_type: "workspace", p_subject_id: crew, p_reason: "Demo: payout account changed twice in 48 hours — review before the next payout.",
      p_signal: ids["q38-demo-payout-1"], p_expires: null });
    out.payout_holds++;
  }
  const staff = await uid("agency.staff.demo@example.com");
  let hold = await q1(`select id, appeal_case_id from public.risk_holds where kind = 'step_up' and subject_type = 'user' and subject_id = '${staff}' and signal_id = '${ids["q38-demo-account-1"]}'`);
  if (!hold) {
    const id = await call(admin, "risk_hold_place", { p_kind: "step_up", p_subject_type: "user", p_subject_id: staff, p_reason: "Demo: new device, password change and payout change within a day.",
      p_signal: ids["q38-demo-account-1"], p_expires: null });
    hold = { id, appeal_case_id: null }; out.step_up_holds++;
  }
  if (!hold.appeal_case_id) {
    await call(await signIn("agency.staff.demo@example.com"), "risk_hold_appeal", { p_hold: hold.id, p_statement: "It was me — I replaced my phone and reset my password the same day. Happy to verify by video call." });
    out.appeals++;
  }
  // Legal hold on a demo workspace.
  const urban = await wsId("Urban Events", "o.bennett@example.com");
  if (!(await q1(`select count(*)::int n from public.legal_holds h join public.legal_hold_subjects s on s.hold_id = h.id where s.subject_id = '${urban}' and h.status = 'active'`)).n) {
    await call(admin, "legal_hold_place", { p_matter: "Demo matter: insurance claim — Urban Events summer party", p_reason: "Demo: preserve records while a public-liability claim is assessed.",
      p_subjects: [{ type: "workspace", id: urban }] });
    out.legal_holds++;
  }
  // Retention-run history (preview only — nothing deleted). One preview per day keeps the history readable.
  if (!(await q1(`select count(*)::int n from public.retention_runs where preview and started_at > now() - interval '20 hours'`)).n) {
    await call(service, "retention_sweep_run", { p_preview: true }); out.retention_previews++;
  }
  // Consent history.
  const CONSENTS = [["alex.thompson@example.com", "marketing_email", true, "signup"], ["alex.thompson@example.com", "cookies_analytics", true, "cookie_banner"],
    ["alex.thompson@example.com", "marketing_email", false, "settings"], ["james.carter@example.com", "cookies_analytics", false, "cookie_banner"],
    ["james.carter@example.com", "marketing_email", true, "settings"], ["ops.lead.demo@example.com", "cookies_marketing", false, "cookie_banner"]];
  for (const [i, [who, purpose, granted, source]] of CONSENTS.entries()) {
    const u = await uid(who);
    const seen = (await q1(`select count(*)::int n from public.consent_records where user_id = '${u}' and context ->> 'demo_seed' = 'depth-pass2-${i}'`)).n
      || (await q1(`select count(*)::int n from public.consent_records where user_id = '${u}' and purpose = '${purpose}' and granted = ${granted} and source = '${source}' and policy_version = '2026-10'`)).n;
    if (seen) continue;
    await call(await signIn(who), "record_consent", { p_purpose: purpose, p_granted: granted, p_version: "2026-10", p_source: source });
    out.consents++;
  }
  return out;
}
