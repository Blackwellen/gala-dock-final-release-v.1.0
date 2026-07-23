"use server";

import { redirect } from "next/navigation";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  stripeConnectConfigured,
  createConnectAccount,
  createConnectAccountLink,
  retrieveConnectAccount,
} from "@/lib/stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.galadock.com";

export async function startConnectOnboarding() {
  const { workspaceId, workspace, user } = await requireWorkspaceManager();

  if (!stripeConnectConfigured()) {
    throw new Error("Stripe Connect isn't configured yet. Ask your Gala Dock admin to enable it.");
  }

  const supabase = await createClient();
  let accountId = workspace.stripe_connect_account_id;

  if (!accountId) {
    const account = await createConnectAccount({ email: user.email, country: "GB" });
    if (!account) throw new Error("Couldn't start Stripe onboarding. Please try again.");
    accountId = account.id;
    await supabase
      .from("workspaces")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", workspaceId);
  }

  const link = await createConnectAccountLink({
    accountId,
    refreshUrl: `${APP_URL}/event-manager/settings/payouts`,
    returnUrl: `${APP_URL}/event-manager/settings/payouts?onboarded=1`,
  });
  if (!link) throw new Error("Couldn't create the onboarding link. Please try again.");

  redirect(link.url);
}

export async function syncConnectStatus() {
  const { workspaceId, workspace } = await requireWorkspaceManager();
  if (!workspace.stripe_connect_account_id || !stripeConnectConfigured()) return;

  const status = await retrieveConnectAccount(workspace.stripe_connect_account_id);
  if (!status) return;

  const supabase = await createClient();
  await supabase
    .from("workspaces")
    .update({
      stripe_connect_charges_enabled: status.chargesEnabled,
      stripe_connect_details_submitted: status.detailsSubmitted,
      stripe_connect_payouts_enabled: status.payoutsEnabled,
      stripe_connect_synced_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);
}
