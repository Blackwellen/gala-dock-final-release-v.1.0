import { CheckCircle2, CircleDashed } from "lucide-react";
import { requireWorkspaceManager } from "@/lib/workspace";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { stripeConnectConfigured } from "@/lib/stripe";
import { PayoutsConnectButton } from "./PayoutsConnectButton";
import { syncConnectStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };

export default async function PayoutsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarded?: string }>;
}) {
  const { onboarded } = await searchParams;
  if (onboarded === "1") {
    await syncConnectStatus();
  }

  const { workspace } = await requireWorkspaceManager();
  const isMarketplacePersona = workspace.workspace_type === "venue" || workspace.workspace_type === "supplier";
  const connected = workspace.stripe_connect_payouts_enabled;
  const pendingConnect = Boolean(workspace.stripe_connect_account_id) && !connected;

  return (
    <SettingsShell title="Payouts" description="Connect a payout account to receive marketplace bookings.">
      {!isMarketplacePersona ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 text-sm text-surface-500">
          Payouts apply to venue and supplier workspaces receiving marketplace bookings. This
          workspace is an organizer — no payout account is needed here.
        </div>
      ) : !stripeConnectConfigured() ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 text-sm text-surface-500">
          Stripe Connect isn&apos;t enabled on this environment yet. Once your Gala Dock admin turns it
          on, you&apos;ll be able to connect a payout account here.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
          <div className="flex items-center gap-3">
            {connected ? (
              <CheckCircle2 className="w-6 h-6 text-success-600" />
            ) : (
              <CircleDashed className="w-6 h-6 text-surface-400" />
            )}
            <div>
              <p className="text-sm font-semibold text-surface-900">
                {connected ? "Payouts connected" : pendingConnect ? "Onboarding in progress" : "Not connected"}
              </p>
              <p className="text-xs text-surface-500">
                {connected
                  ? "You're all set — marketplace bookings pay out automatically."
                  : "Connect a Stripe account so marketplace bookings can pay you out."}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-surface-50 border border-surface-200 p-4 text-xs text-surface-500 space-y-1">
            <p>How marketplace bookings are split:</p>
            <p>• Gala Dock takes a 5% commission from your payout.</p>
            <p>• The buyer (event manager or venue manager) pays a separate 1% admin fee on top — it never comes out of your price.</p>
          </div>

          {!connected && (
            <PayoutsConnectButton label={pendingConnect ? "Finish onboarding" : "Connect payouts"} />
          )}
        </div>
      )}
    </SettingsShell>
  );
}
