"use server";

import { getAdmin } from "@/lib/admin/context";
import { friendly as baseFriendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";
import { money } from "@/lib/workspace/format";
import { payPartnerStatement, recoverPartnerClawback, retryPartnerBankPayout } from "@/lib/partners/payouts";
import { sendPortalInvite } from "@/lib/partners/invites";
import { isConnectCountrySupported } from "@/lib/payments/connect-countries";

/* Q68 partner programme actions (owner decisions 2026-11-14). Every database step is a security-definer RPC that re-checks the
   partners permission, aal2 and a reason, and writes audit_events. Statements are paid by Stripe Connect transfer (test mode
   until the owner says live); manual "Mark paid" and partner money requests are retired. */

const ERRORS: [RegExp, string][] = [
  [/below_minimum/, "This statement is below the minimum payout. It rolls over to next month automatically."],
  [/negative_balance/, "This statement is negative (clawbacks exceed earnings). It carries forward — use “Recover via transfer reversal” if the partner still has funds in Stripe."],
  [/period_open/, "This month isn’t over yet. Statements can be paid after the month ends."],
  [/payouts_not_set_up/, "The partner hasn’t finished Stripe payout setup. Their balance keeps accruing until they do."],
  [/payout_hold_active/, "A security hold is active on this partner. Payouts resume when the review is complete."],
  [/mode_changed/, "This statement was started in another Stripe mode. Contact engineering before retrying."],
  [/invalid_state/, "This statement is already settled, rolled over or on hold."],
  [/not_negative/, "This statement isn’t negative, so there is nothing to recover."],
  [/no_transfer_to_reverse/, "There’s no earlier Stripe transfer to reverse for this partner. The negative balance carries forward."],
  [/reversal_exceeds_transfer/, "That is more than remains on the partner’s last transfer."],
  [/partner_exists/, "A partner with that email already exists."],
  [/already_partner/, "This person is already a partner."],
  [/already_linked/, "This partner already has a login."],
  [/partner_terminated/, "This partnership has been terminated."],
  [/invalid_email/, "Enter a valid email address."],
  [/invalid_name/, "Enter the partner’s name (2–120 characters)."],
  [/invalid_rate/, "Commission must be between 0% and 50%."],
  [/invalid_country/, "Choose the partner’s country."],
  [/rate_limited/, "Too many invitations. Please wait and try again later."],
  // Stripe error codes
  [/balance_insufficient/, "Gala Dock’s Stripe platform balance is too low for this transfer. Top up the platform balance, then retry (the retry can’t pay twice)."],
  [/account_invalid|resource_missing/, "Stripe can’t find the partner’s payout account. Ask the partner to set up payouts again."],
  [/transfers_not_allowed|capability/, "The partner’s Stripe account can’t receive transfers yet. Ask them to finish payout setup."],
  [/stripe_not_configured/, "Stripe isn’t configured in this environment."],
];
const friendly = (e: { message?: string } | string | null) => { const m = typeof e === "string" ? e : e?.message ?? ""; return ERRORS.find(([re]) => re.test(m))?.[1] ?? baseFriendly({ message: m }); };
const bad = (error = "That record no longer exists."): ActionResult => ({ ok: false, error });
const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

/** "Pay via Stripe": prepare → Connect transfer (idempotency key per statement) → record → manual payout to the partner's bank. */
export async function payStatementViaStripe(statementId: string, reason: string): Promise<ActionResult> {
  if (!isUuid(statementId)) return bad();
  const { db } = await getAdmin();
  const r = await payPartnerStatement(db, statementId, reason);
  if (!r.ok) return { ok: false, error: r.stage === "record" ? "Stripe made the transfer but recording it failed. Retry — the same transfer is reused, never paid twice." : friendly(r.error) };
  return { ok: true, message: r.payout ? `Paid: transfer ${r.transfer}; bank payout ${r.payout} started.` : `Transferred (${r.transfer}). The bank payout didn’t start (${friendly(r.payoutError ?? "")}) — use “Send to bank” to retry.` };
}

export async function sendStatementToBank(statementId: string, reason: string): Promise<ActionResult> {
  if (!isUuid(statementId)) return bad();
  const { db } = await getAdmin();
  const r = await retryPartnerBankPayout(db, statementId, reason);
  return r.ok ? { ok: true, message: `Bank payout ${r.payout} started.` } : { ok: false, error: friendly(r.error) };
}

export async function recoverStatementClawback(statementId: string, reason: string): Promise<ActionResult> {
  if (!isUuid(statementId)) return bad();
  const { db } = await getAdmin();
  const r = await recoverPartnerClawback(db, statementId, reason);
  return r.ok ? { ok: true, message: `Recovered ${money(r.amount_minor / 100, "GBP", { cents: true })} by reversing the partner’s last transfer.` } : { ok: false, error: friendly(r.error) };
}

/** Admin "Create partner" (extra path next to self-serve applications), optionally followed by a login invitation. */
export async function createPartner(data: FormData): Promise<ActionResult> {
  const name = str(data, "name"), email = str(data, "email").toLowerCase(), kind = str(data, "kind"), terms = str(data, "terms"), country = str(data, "country").toUpperCase(), reason = str(data, "reason");
  const rate = Number(str(data, "rate"));
  if (terms === "custom" && (!Number.isFinite(rate) || rate < 0 || rate > 50)) return { ok: false, error: "Commission must be between 0% and 50%." };
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: "Choose the partner’s country." };
  const { db } = await getAdmin();
  const { data: id, error } = await db.rpc("admin_create_partner", { p_name: name, p_email: email, p_kind: kind, p_commission_bps: terms === "custom" ? Math.round(rate * 100) : null, p_country: country, p_reason: reason });
  if (error) return { ok: false, error: friendly(error) };
  let note = "";
  if (data.get("invite") === "on") {
    const inv = await sendPortalInvite(db, { rpc: "admin_partner_invite", args: { p_partner: id, p_reason: reason }, email,
      subject: "You’re invited to the Gala Dock partner portal", body: `${name} has been set up as a Gala Dock partner. Accept this invitation to open the partner portal, get your referral link and set up payouts.` });
    note = inv.ok ? (inv.emailed ? " Login invitation emailed." : ` Invitation created but the email couldn’t be queued — share this link: ${inv.link}`) : ` The login invitation failed: ${friendly(inv.error)}`;
  }
  const payoutNote = isConnectCountrySupported(country) ? "" : " Stripe payouts aren’t available in this country: agree another way to pay them.";
  return { ok: true, message: `Partner created.${note}${payoutNote}`, redirect: `/admin/partners?partner=${id as string}` };
}

/** "Invite login" for an existing partner without a user. */
export async function invitePartnerLogin(data: FormData): Promise<ActionResult> {
  const id = str(data, "partner_id"), email = str(data, "email").toLowerCase(), reason = str(data, "reason");
  if (!isUuid(id)) return bad();
  const { db } = await getAdmin();
  const inv = await sendPortalInvite(db, { rpc: "admin_partner_invite", args: { p_partner: id, p_reason: reason }, email,
    subject: "You’re invited to the Gala Dock partner portal", body: "Accept this invitation to open the Gala Dock partner portal, get your referral link and set up payouts." });
  if (!inv.ok) return { ok: false, error: friendly(inv.error) };
  return { ok: true, message: inv.emailed ? `Invitation emailed to ${email}.` : `Invitation created but not emailed — share this link: ${inv.link}` };
}

/** Partner application queue: approve (creates the partner linked to the applicant's login) or reject with a reason. */
export async function decideApplication(data: FormData): Promise<ActionResult> {
  const id = str(data, "application_id"), approve = str(data, "decision") === "approve", terms = str(data, "terms"), rate = Number(str(data, "rate"));
  if (!isUuid(id)) return bad();
  if (approve && terms === "custom" && (!Number.isFinite(rate) || rate < 0 || rate > 50)) return { ok: false, error: "Commission must be between 0% and 50%." };
  const { db } = await getAdmin();
  const { data: pid, error } = await db.rpc("admin_partner_application_decide", { p_application: id, p_approve: approve, p_kind: str(data, "kind") || "affiliate",
    p_commission_bps: approve && terms === "custom" ? Math.round(rate * 100) : null, p_reason: str(data, "reason") });
  if (error) return { ok: false, error: friendly(error) };
  return approve ? { ok: true, message: "Application approved — the partner can open the partner portal now.", redirect: `/admin/partners?partner=${pid as string}` }
    : { ok: true, message: "Application rejected — the applicant has been told." };
}
