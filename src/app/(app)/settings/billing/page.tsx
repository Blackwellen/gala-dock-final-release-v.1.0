import { CreditCard, ExternalLink } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Billing Settings" };

// Map subscription_status enum -> StatusBadge union.
const STATUS_BADGE: Record<string, "active" | "trialing" | "past-due" | "cancelled" | "pending" | "unpaid"> = {
  active: "active",
  trialing: "trialing",
  past_due: "past-due",
  canceled: "cancelled",
  incomplete: "pending",
  unpaid: "unpaid",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function BillingSettingsPage() {
  const { workspaceId, workspace } = await requireWorkspace();
  const supabase = await createClient();

  const { data: subscription } = await supabase
    .from("billing_subscriptions")
    .select("plan, status, current_period_end, trial_end, cancel_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let plan: {
    display_name: string;
    description: string | null;
    monthly_price_cents: number;
  } | null = null;
  if (subscription) {
    const { data: planRow } = await supabase
      .from("billing_plans")
      .select("display_name, description, monthly_price_cents")
      .eq("code", subscription.plan)
      .maybeSingle();
    plan = planRow ?? null;
  }

  return (
    <SettingsShell title="Billing" description="Manage your subscription, payment method, and invoices.">
      <div className="max-w-2xl space-y-6">
        {!subscription ? (
          <div className="bg-white border border-surface-200 rounded-xl shadow-card">
            <EmptyState
              icon={CreditCard}
              title="No subscription found"
              description="This workspace does not have an active billing subscription yet."
              compact
            />
          </div>
        ) : (
          <>
            {/* Current plan */}
            <div className="bg-white border border-surface-200 rounded-xl shadow-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Current plan</p>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-lg font-bold text-surface-900">
                      {plan?.display_name ?? subscription.plan}
                    </p>
                    <StatusBadge status={STATUS_BADGE[subscription.status] ?? "pending"} />
                  </div>
                  <p className="text-sm text-surface-500">
                    {plan
                      ? `${formatPrice(plan.monthly_price_cents, workspace.currency)} / month`
                      : "Plan pricing unavailable"}
                    {subscription.current_period_end
                      ? ` · renews on ${formatDate(subscription.current_period_end)}`
                      : ""}
                  </p>
                  {plan?.description && (
                    <p className="mt-3 text-sm text-surface-600">{plan.description}</p>
                  )}
                  {subscription.trial_end && (
                    <p className="mt-2 text-xs text-surface-400">Trial ends {formatDate(subscription.trial_end)}</p>
                  )}
                  {subscription.cancel_at && (
                    <p className="mt-2 text-xs text-danger-600">Cancels on {formatDate(subscription.cancel_at)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-700 bg-surface-50 hover:bg-surface-100 border border-surface-200 rounded-lg transition-colors whitespace-nowrap">
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Manage billing
                  </button>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div className="border-t border-surface-100 pt-6">
              <h2 className="text-sm font-semibold text-surface-900 mb-4">Payment method</h2>
              <div className="bg-white border border-surface-200 rounded-xl shadow-card p-4 flex items-center gap-3">
                <div className="w-10 h-7 bg-surface-100 border border-surface-200 rounded flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
                </div>
                <p className="text-sm text-surface-500">
                  Payment methods are managed through the billing portal.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </SettingsShell>
  );
}
