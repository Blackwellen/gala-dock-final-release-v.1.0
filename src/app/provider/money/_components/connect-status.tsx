import { Chip } from "@/components/workspace/kit";
import { createClient } from "@/lib/supabase/server";
import { ConnectButton } from "./connect-button";
import { SellerPayouts } from "@/components/payments/seller-payouts";
import "@/styles/provider-credentials.css";

type Account = { verification_state: string; payouts_enabled: boolean; requirements_currently_due: string[]; requirements_past_due: string[]; disabled_reason: string | null };
const STATE: Record<string, [string, "green" | "orange" | "red" | "grey" | "blue"]> = {
  verified: ["Payouts active", "green"], pending: ["In review by Stripe", "blue"], action_required: ["Action required", "orange"],
  restricted: ["Restricted", "red"], suspended: ["Suspended", "red"], unverified: ["Not set up", "grey"],
};

/** Payout account status line (spec §29). Reads authoritative Stripe state synced by the webhook. */
export async function ConnectStatus({ workspaceId, canManage, kind = "provider" }: { workspaceId: string; canManage: boolean; kind?: "provider" | "organizer" }) {
  const supabase = await createClient();
  const { data } = await supabase.from("connect_accounts" as never).select("verification_state,payouts_enabled,requirements_currently_due,requirements_past_due,disabled_reason").eq("workspace_id", workspaceId).maybeSingle();
  const a = data as Account | null;
  const [label, tone] = STATE[a?.verification_state ?? "unverified"] ?? STATE.unverified;
  const due = (a?.requirements_past_due.length ?? 0) + (a?.requirements_currently_due.length ?? 0);
  return <div className="pc-connect" role="status">
    <Chip tone={tone} dot>{label}</Chip>
    <small>{!a ? "Connect a Stripe account to receive payouts." : a.payouts_enabled ? "Customers pay into your Stripe account; each payment is paid out to your bank when its booking or event is complete." : due ? `${due} item${due === 1 ? "" : "s"} needed by Stripe before payouts can start.` : "Payouts are paused until Stripe completes checks."}</small>
    {canManage && (!a || !a.payouts_enabled) && <ConnectButton kind={kind} label={a ? "Continue with Stripe" : "Set up payouts"} />}
    {/* DEC-107: releases from the seller's own balance + chargebacks with evidence (organiser and provider Money). */}
    <SellerPayouts workspaceId={workspaceId} canManage={canManage} />
  </div>;
}
