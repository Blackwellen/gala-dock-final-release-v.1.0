import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { payoutStatus } from "@/lib/stripe";
import { columnForMode, type StripeModeState } from "@/lib/payments/stripe-mode";

/** The subset of a Stripe Account object this module relies on. */
export type StripeAccount = {
  id: string; type?: string; country?: string; default_currency?: string; details_submitted?: boolean;
  charges_enabled?: boolean; payouts_enabled?: boolean; metadata?: Record<string, string>;
  capabilities?: { transfers?: string; card_payments?: string }; business_type?: string | null;
  controller?: { type?: string; is_controller?: boolean; fees?: { payer?: string }; losses?: { payments?: string }; stripe_dashboard?: { type?: string }; requirement_collection?: string };
  requirements?: { currently_due?: string[]; eventually_due?: string[]; past_due?: string[]; disabled_reason?: string | null };
};

export type VerificationState = "unverified" | "pending" | "verified" | "action_required" | "restricted" | "suspended";

/** Maps authoritative Stripe state to Gala Dock's verification vocabulary (spec §30). */
export function connectVerificationState(a: StripeAccount): VerificationState {
  const r = a.requirements ?? {};
  if (r.disabled_reason?.startsWith("rejected")) return "suspended";
  if (r.disabled_reason) return (r.past_due?.length ?? 0) > 0 ? "action_required" : "restricted";
  if ((r.past_due?.length ?? 0) > 0 || (r.currently_due?.length ?? 0) > 0) return a.details_submitted ? "action_required" : "unverified";
  // Identity/payout verification only. Whether the seller can take direct charges is sellerReadiness() (card_payments active).
  if (a.charges_enabled && a.payouts_enabled && (a.capabilities?.transfers === "active" || a.capabilities?.card_payments === "active")) return "verified";
  return a.details_submitted ? "pending" : "unverified";
}

/**
 * Persists a Stripe Connect account snapshot (from `account.updated` or a fresh retrieve) for the given Stripe mode — the mode of
 * the key that read it / the event's verified livemode. Idempotent: writing the same snapshot twice changes nothing and records no
 * duplicate verification. Per-mode rules (migration 202610295001): the account id goes to the mode's column
 * (stripe_account_id = test, stripe_account_id_live = live); a test snapshot never replaces a live connect_accounts row; trust and
 * verification records follow only the platform mode, so a test-mode server sharing the database cannot change live trust state.
 */
export async function syncConnectAccount(account: StripeAccount, mode: StripeModeState) {
  if (mode === "unconfigured") throw new Error("stripe_not_configured");
  const live = mode === "live";
  const db = untyped(createAdminClient() as never);
  let workspaceId: string | undefined = account.metadata?.workspace_id;
  if (!workspaceId) {
    const { data } = await db.from("workspaces").select("id").eq(columnForMode(mode, "stripe_account_id"), account.id).maybeSingle();
    workspaceId = data?.id;
  }
  if (!workspaceId) return null; // not one of ours (or created outside Gala Dock)

  const state = connectVerificationState(account);
  const [{ data: previous }, { data: platformLive }] = await Promise.all([
    db.from("connect_accounts").select("verification_state,livemode").eq("workspace_id", workspaceId).maybeSingle(),
    db.rpc("stripe_platform_livemode", {}),
  ]);
  const r = account.requirements ?? {};
  const status = payoutStatus({ charges_enabled: !!account.charges_enabled, payouts_enabled: !!account.payouts_enabled, details_submitted: !!account.details_submitted, requirements: { disabled_reason: r.disabled_reason ?? null } });
  // Per-mode workspace shadow (+ payout_status when this is the platform mode).
  const shadow = await db.rpc("stripe_workspace_payout_sync", { p_workspace: workspaceId, p_livemode: live, p_status: status, p_account: account.id });
  if (shadow.error) throw new Error(`connect payout sync: ${shadow.error.message}`);
  if (previous?.livemode === true && !live) return { workspaceId, state, skipped: "live_row_protected" as const };

  const { error } = await db.from("connect_accounts").upsert({
    workspace_id: workspaceId, stripe_account_id: account.id, account_type: account.type ?? "express", livemode: live,
    country: account.country ?? null, default_currency: account.default_currency ?? null,
    details_submitted: !!account.details_submitted, charges_enabled: !!account.charges_enabled, payouts_enabled: !!account.payouts_enabled,
    transfers_capability: account.capabilities?.transfers ?? "inactive", card_payments_capability: account.capabilities?.card_payments ?? "inactive",
    requirements_currently_due: r.currently_due ?? [], requirements_eventually_due: r.eventually_due ?? [], requirements_past_due: r.past_due ?? [],
    disabled_reason: r.disabled_reason ?? null, verification_state: state, last_event_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    // Connect configuration (card 125.E): who pays Stripe fees / bears losses and which dashboard the seller uses.
    controller: account.controller ?? null, fees_payer: account.controller?.fees?.payer ?? null, losses_payments: account.controller?.losses?.payments ?? null,
    dashboard_type: account.controller?.stripe_dashboard?.type ?? (account.type === "standard" ? "full" : account.type === "express" ? "express" : null),
    business_type: account.business_type ?? null, capabilities_json: account.capabilities ?? {},
    requirements_json: { currently_due: r.currently_due ?? [], eventually_due: r.eventually_due ?? [], past_due: r.past_due ?? [], disabled_reason: r.disabled_reason ?? null },
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
  if (error) throw new Error(`connect sync: ${error.message}`);
  if ((platformLive === true) !== live) return { workspaceId, state, skipped: "not_platform_mode" as const };

  // Q08: mirror into the guarded `verification` machine (verification_checks, kind stripe_connect). Read-only from webhook data —
  // no Stripe API call. Idempotent (same state = no step); refreshes the derived badges/eligibility for this workspace.
  const mirrored = await db.rpc("trust_sync_stripe_check", { p_workspace: workspaceId, p_state: state, p_account: account.id,
    p_evidence: { disabled_reason: r.disabled_reason ?? null, currently_due: r.currently_due ?? [] } });
  if (mirrored.error) throw new Error(`connect verification sync: ${mirrored.error.message}`);

  if (previous?.verification_state !== state) {
    await db.from("verification_records").insert({
      workspace_id: workspaceId, kind: "stripe_connect", status: state,
      // Honest scope (§30): Stripe verifies identity/payment eligibility, not service quality.
      scope: "Payment account details and identity checks completed with Stripe for receiving payouts. This does not verify service quality, insurance or licences.",
      evidence: { stripe_account_id: account.id, currently_due: r.currently_due ?? [], disabled_reason: r.disabled_reason ?? null },
    });
    await db.from("audit_events").insert({ workspace_id: workspaceId, event: "trust.connect_state_changed", actor_type: "webhook", metadata: { from: previous?.verification_state ?? null, to: state } });
  }
  return { workspaceId, state };
}

/**
 * Clears a connected-account link the current key cannot see (isStaleAccountError) — for the CURRENT mode's column only, so a
 * test-mode server never touches live links. The cached connect_accounts row for that id is marked unusable (never deleted) so
 * readiness reads "not set up"; the next "Set up payouts" creates a fresh account. Audited.
 */
export async function clearStaleAccountLink(workspaceId: string, mode: StripeModeState, accountId: string, source: string) {
  if (mode === "unconfigured") return;
  const live = mode === "live";
  const db = untyped(createAdminClient() as never);
  await db.from("workspaces").update({ [columnForMode(mode, "stripe_account_id")]: null }).eq("id", workspaceId).eq(columnForMode(mode, "stripe_account_id"), accountId);
  await db.from("connect_accounts").update({ charges_enabled: false, payouts_enabled: false, disabled_reason: "stale_account_link", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId).eq("stripe_account_id", accountId).eq("livemode", live);
  await db.rpc("stripe_workspace_payout_sync", { p_workspace: workspaceId, p_livemode: live, p_status: "not_connected", p_account: null });
  await db.from("audit_events").insert({ workspace_id: workspaceId, actor_type: "system", event: "stripe.stale_account_cleared", metadata: { account: accountId, mode, source } });
}
