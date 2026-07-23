import Link from "next/link";
import { Banknote, Lock, AlertCircle } from "lucide-react";
import { getPersonaContext } from "@/lib/flags/context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { SectionTabs, LISTINGS_TABS } from "@/components/ui/SectionTabs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-surface-100 text-surface-600 border-surface-200" },
  confirmed: { label: "Confirmed", classes: "bg-info-50 text-info-600 border-info-200" },
  completed: { label: "Paid out", classes: "bg-success-50 text-success-700 border-success-200" },
  cancelled: { label: "Cancelled", classes: "bg-surface-100 text-surface-500 border-surface-200" },
  disputed: { label: "Disputed", classes: "bg-danger-50 text-danger-600 border-danger-200" },
  refunded: { label: "Refunded", classes: "bg-danger-50 text-danger-600 border-danger-200" },
};

function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ListingPayoutsPage() {
  const { workspaceId, workspaceType, flags } = await getPersonaContext();

  const marketplaceFlagOn =
    workspaceType === "venue" ? flags.marketplaceVenue : flags.marketplaceSupplier;

  if (!marketplaceFlagOn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="max-w-md w-full rounded-2xl border border-surface-200 bg-white p-10 text-center shadow-card">
          <div className="mx-auto w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mb-5">
            <Lock className="w-6 h-6 text-brand-600" />
          </div>
          <h2 className="text-xl font-semibold text-surface-900 mb-2">Payouts</h2>
          <p className="text-sm text-surface-500">
            The marketplace is not enabled for this workspace yet. Contact your workspace owner or
            Gala Dock support to turn it on.
          </p>
        </div>
      </div>
    );
  }

  if (!workspaceId) return null;

  const supabase = await createClient();

  const [{ data: workspace }, { data: bookings }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("marketplace_bookings")
      .select(
        "id, listing_id, buyer_workspace_id, booking_date, price_cents, currency, supplier_payout_cents, status, stripe_transfer_id, created_at"
      )
      .eq("supplier_workspace_id", workspaceId)
      .order("booking_date", { ascending: false }),
  ]);

  const bookingList = bookings ?? [];

  const listingIds = Array.from(new Set(bookingList.map((b) => b.listing_id)));
  const buyerIds = Array.from(
    new Set(bookingList.map((b) => b.buyer_workspace_id).filter((id): id is string => Boolean(id)))
  );
  const [{ data: listings }, { data: buyers }] = await Promise.all([
    listingIds.length
      ? supabase.from("marketplace_listings").select("id, title").in("id", listingIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    buyerIds.length
      ? supabase.from("workspaces").select("id, name").in("id", buyerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const listingTitleById = new Map((listings ?? []).map((l) => [l.id, l.title]));
  const buyerNameById = new Map((buyers ?? []).map((b) => [b.id, b.name]));

  const paidOutCents = bookingList
    .filter((b) => b.stripe_transfer_id)
    .reduce((sum, b) => sum + (b.supplier_payout_cents ?? 0), 0);
  const pendingPayoutCents = bookingList
    .filter((b) => !b.stripe_transfer_id && (b.status === "completed" || b.status === "confirmed"))
    .reduce((sum, b) => sum + (b.supplier_payout_cents ?? 0), 0);

  const stripeConnected = Boolean(workspace?.stripe_connect_payouts_enabled);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Payouts"
        description="Earnings from marketplace bookings on your listings, and their payout status."
        tabs={<SectionTabs tabs={LISTINGS_TABS} />}
      />

      <div className="flex-1 px-6 py-6 space-y-6">
        {!stripeConnected && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-warning-50 border border-warning-200 text-sm text-warning-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.8} />
            <div>
              Stripe Connect is not fully set up for this workspace yet — payouts cannot be released
              until it is. Finish setup in{" "}
              <Link href="/event-manager/settings/payouts" className="font-medium underline">
                Settings → Payouts
              </Link>
              .
            </div>
          </div>
        )}

        <KPIGrid>
          <MetricCard
            label="Paid out"
            value={formatMoney(paidOutCents, "GBP")}
            icon={Banknote}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Pending payout"
            value={formatMoney(pendingPayoutCents, "GBP")}
            icon={Banknote}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
          <MetricCard label="Total bookings" value={bookingList.length} icon={Banknote} />
        </KPIGrid>

        {bookingList.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Banknote}
              title="No marketplace bookings yet"
              description="Once a buyer books one of your listings, the payout for that booking will be tracked here."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-xs font-semibold uppercase tracking-wider text-surface-400">
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Booking date</th>
                  <th className="px-4 py-3">Your payout</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookingList.map((b) => {
                  const meta = STATUS_META[b.status] ?? STATUS_META.pending;
                  const paid = Boolean(b.stripe_transfer_id);
                  return (
                    <tr key={b.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50">
                      <td className="px-4 py-3 font-medium text-surface-900">
                        {listingTitleById.get(b.listing_id) ?? "Listing"}
                      </td>
                      <td className="px-4 py-3 text-surface-600">
                        {(b.buyer_workspace_id && buyerNameById.get(b.buyer_workspace_id)) ?? "Unknown buyer"}
                      </td>
                      <td className="px-4 py-3 text-surface-600">{formatDate(b.booking_date)}</td>
                      <td className="px-4 py-3 font-medium text-surface-900 tabular-nums">
                        {formatMoney(b.supplier_payout_cents, b.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
                            paid ? STATUS_META.completed.classes : meta.classes
                          )}
                        >
                          {paid ? "Paid out" : meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
