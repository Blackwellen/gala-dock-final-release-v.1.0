import {
  Building2, CreditCard, PoundSterling, Users2,
  Store, TrendingUp, ShoppingBag,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

// Platform-wide metrics — service-role reads (cross-workspace, no single workspace_id to scope by).
// Every value here is a real Supabase count/aggregate, never a hardcoded placeholder.
async function loadAdminOverview() {
  const admin = createAdminClient();

  const [
    { count: totalWorkspaces },
    { count: activeSubscriptions },
    { count: totalCustomers },
    { count: liveListings },
    { data: recentWorkspaces },
    { data: recentBookings },
  ] = await Promise.all([
    admin.from("workspaces").select("id", { count: "exact", head: true }),
    admin.from("workspaces").select("id", { count: "exact", head: true }).not("plan", "in", "(trial,free)"),
    admin.from("customers").select("id", { count: "exact", head: true }),
    admin.from("marketplace_listings").select("id", { count: "exact", head: true }).eq("status", "live"),
    admin
      .from("workspaces")
      .select("id, name, plan, workspace_type, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    admin
      .from("marketplace_bookings")
      .select("id, price_cents, currency, status, created_at, listing_id")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const listingIds = (recentBookings ?? []).map((b) => b.listing_id);
  const { data: listings } = listingIds.length
    ? await admin.from("marketplace_listings").select("id, title").in("id", listingIds)
    : { data: [] as { id: string; title: string }[] };
  const listingTitleById = new Map((listings ?? []).map((l) => [l.id, l.title]));

  return {
    totalWorkspaces: totalWorkspaces ?? 0,
    activeSubscriptions: activeSubscriptions ?? 0,
    totalCustomers: totalCustomers ?? 0,
    liveListings: liveListings ?? 0,
    recentWorkspaces: recentWorkspaces ?? [],
    recentBookings: (recentBookings ?? []).map((b) => ({ ...b, listingTitle: listingTitleById.get(b.listing_id) ?? "Listing" })),
  };
}

export default async function AdminOverviewPage() {
  const { totalWorkspaces, activeSubscriptions, totalCustomers, liveListings, recentWorkspaces, recentBookings } =
    await loadAdminOverview();

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtMoney(cents: number, currency: string) {
    return (cents / 100).toLocaleString("en-GB", { style: "currency", currency });
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Admin Overview"
        description="Platform-level metrics and recent activity — live from Supabase."
      />

      <div className="p-6 space-y-8">
        <KPIGrid className="grid-cols-2 sm:grid-cols-4">
          <MetricCard label="Total Workspaces" value={totalWorkspaces} icon={Building2} iconBg="bg-brand-50" iconColor="text-brand-600" />
          <MetricCard label="Paid Subscriptions" value={activeSubscriptions} icon={CreditCard} iconBg="bg-success-50" iconColor="text-success-600" />
          <MetricCard label="Customer Accounts" value={totalCustomers} icon={Users2} iconBg="bg-violet-50" iconColor="text-violet-600" />
          <MetricCard label="Live Marketplace Listings" value={liveListings} icon={Store} iconBg="bg-warning-50" iconColor="text-warning-600" />
        </KPIGrid>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Recent workspaces */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
                Recent Workspaces
              </h2>
            </div>
            {recentWorkspaces.length === 0 ? (
              <div className="p-8 text-center text-sm text-surface-400">No workspaces yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Workspace</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Plan</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {recentWorkspaces.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-surface-900">
                          <a href={`/admin/workspaces/${row.id}`} className="hover:text-brand-600">{row.name}</a>
                        </td>
                        <td className="px-5 py-3 text-surface-500 capitalize">{row.workspace_type}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 capitalize">
                            {row.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-surface-500">{fmtDate(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent marketplace bookings */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
              <h2 className="text-sm font-semibold text-surface-900">Recent Marketplace Bookings</h2>
            </div>
            {recentBookings.length === 0 ? (
              <div className="p-8 text-center text-sm text-surface-400">No marketplace bookings yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Listing</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Amount</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-50">
                    {recentBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-surface-900">{b.listingTitle}</td>
                        <td className="px-5 py-3 text-surface-600 tabular-nums">{fmtMoney(b.price_cents, b.currency)}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200 capitalize">
                            {b.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-surface-500">{fmtDate(b.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-surface-50 border border-surface-200 p-4 text-xs text-surface-500 flex items-center gap-2">
          <PoundSterling className="w-3.5 h-3.5" />
          MRR, support tickets and AI usage aren&apos;t wired to real data sources yet — the earlier
          version of this page showed hardcoded placeholder figures for those; they&apos;ve been
          removed rather than left faked. See /admin/subscriptions, /admin/ai-usage and
          /admin/support for their own (still-mock) detail views.
        </div>
      </div>
    </div>
  );
}
