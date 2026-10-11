import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { payoutStatus } from "@/lib/stripe";

/** The subset of a Stripe Account object this module relies on. */
export type StripeAccount = {
  id: string; type?: string; country?: string; default_currency?: string; details_submitted?: boolean;
  charges_enabled?: boolean; payouts_enabled?: boolean; metadata?: Record<string, string>;
  capabilities?: { transfers?: string; card_payments?: string };
  requirements?: { currently_due?: string[]; eventually_due?: string[]; past_due?: string[]; disabled_reason?: string | null };
};

export type VerificationState = "unverified" | "pending" | "verified" | "action_required" | "restricted" | "suspended";

/** Maps authoritative Stripe state to Gala Dock's verification vocabulary (spec §30). */
export function connectVerificationState(a: StripeAccount): VerificationState {
  const r = a.requirements ?? {};
  if (r.disabled_reason?.startsWith("rejected")) return "suspended";
  if (r.disabled_reason) return (r.past_due?.length ?? 0) > 0 ? "action_required" : "restricted";
  if ((r.past_due?.length ?? 0) > 0 || (r.currently_due?.length ?? 0) > 0) return a.details_submitted ? "action_required" : "unverified";
  if (a.charges_enabled && a.payouts_enabled && a.capabilities?.transfers === "active") return "verified";
  return a.details_submitted ? "pending" : "unverified";
}

/**
 * Persists a Stripe Connect account snapshot (from `account.updated` or a fresh retrieve).
 * Idempotent: writing the same snapshot twice changes nothing and records no duplicate verification.
 */
export async function syncConnectAccount(account: StripeAccount) {
  const db = untyped(createAdminClient() as never);
  let workspaceId: string | undefined = account.metadata?.workspace_id;
  if (!workspaceId) {
    const { data } = await db.from("workspaces").select("id").eq("stripe_account_id", account.id).maybeSingle();
    workspaceId = data?.id;
  }
  if (!workspaceId) return null; // not one of ours (or created outside Gala Dock)

  const state = connectVerificationState(account);
  const { data: previous } = await db.from("connect_accounts").select("verification_state").eq("workspace_id", workspaceId).maybeSingle();
  const r = account.requirements ?? {};
  const { error } = await db.from("connect_accounts").upsert({
    workspace_id: workspaceId, stripe_account_id: account.id, account_type: account.type ?? "express",
    country: account.country ?? null, default_currency: account.default_currency ?? null,
    details_submitted: !!account.details_submitted, charges_enabled: !!account.charges_enabled, payouts_enabled: !!account.payouts_enabled,
    transfers_capability: account.capabilities?.transfers ?? "inactive", card_payments_capability: account.capabilities?.card_payments ?? "inactive",
    requirements_currently_due: r.currently_due ?? [], requirements_eventually_due: r.eventually_due ?? [], requirements_past_due: r.past_due ?? [],
    disabled_reason: r.disabled_reason ?? null, verification_state: state, last_event_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
  if (error) throw new Error(`connect sync: ${error.message}`);

  // Keep the existing workspace-level payout status (read by readiness checks) in step.
  await db.from("workspaces").update({ payout_status: payoutStatus({ charges_enabled: !!account.charges_enabled, payouts_enabled: !!account.payouts_enabled, details_submitted: !!account.details_submitted, requirements: { disabled_reason: r.disabled_reason ?? null } }), stripe_account_id: account.id }).eq("id", workspaceId);

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
