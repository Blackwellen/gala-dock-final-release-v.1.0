import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { Plus, Ticket, TrendingUp, Users, Scan, Download } from "lucide-react";

export const dynamic = "force-dynamic";

function gbp(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100);
}

const TIER_COLORS = [
  "bg-blue-500", "bg-amber-500", "bg-green-500", "bg-violet-500", "bg-gray-400",
];

interface TicketTier {
  id: string;
  name: string | null;
  price_cents: number | null;
  quantity: number | null;
  sold: number | null;
  status: string | null;
}

interface Order {
  id: string;
  buyer_name: string | null;
  quantity: number | null;
  amount_cents: number | null;
  created_at: string | null;
  ticket_type_id: string | null;
}

export default async function TicketsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, guest_count_day, guest_count_evening, budget_cents")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: tiersData } = await supabase
    .from("ticket_types")
    .select("id, name, price_cents, quantity, sold, status")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("price_cents", { ascending: true });
  const { data: ordersData } = await supabase
    .from("ticket_orders")
    .select("id, buyer_name, quantity, amount_cents, created_at, ticket_type_id")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(10);
  const { count: checkedIn } = await supabase
    .from("event_guests")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .not("checked_in_at", "is", null);

  const tiers = (tiersData ?? []) as unknown as TicketTier[];
  const orders = (ordersData ?? []) as unknown as Order[];

  const totalSold = tiers.reduce((s, t) => s + (t.sold ?? 0), 0);
  const totalAvailable = tiers.reduce((s, t) => s + (t.quantity ?? 0), 0);
  const totalRevenue = tiers.reduce((s, t) => s + ((t.sold ?? 0) * (t.price_cents ?? 0)), 0);
  const totalCapacity = event.guest_count_day ?? totalAvailable;
  const soldPct = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
  const avgPrice = totalSold > 0 ? totalRevenue / totalSold : 0;

  const kpis = [
    { label: "Tickets Sold", value: totalSold.toLocaleString("en-GB"), sub: `${soldPct}% of capacity`, icon: Ticket, color: "text-brand-600", bg: "bg-brand-50" },
    { label: "Gross Sales", value: gbp(totalRevenue), sub: "+12.4% vs yesterday", icon: TrendingUp, color: "text-success-600", bg: "bg-success-50" },
    { label: "Avg. Ticket Price", value: gbp(Math.round(avgPrice)), sub: "+5.2% vs last 7 days", icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50" },
    { label: "Checked In (Onsite)", value: (checkedIn ?? 0).toLocaleString("en-GB"), sub: `${totalSold > 0 ? Math.round(((checkedIn ?? 0) / totalSold) * 100) : 0}% of sold`, icon: Scan, color: "text-blue-600", bg: "bg-blue-50" },
  ];

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Tickets</h2>
          <p className="text-sm text-surface-500">{tiers.length} tier{tiers.length !== 1 ? "s" : ""} · {totalSold.toLocaleString("en-GB")} sold · {(totalCapacity - totalSold).toLocaleString("en-GB")} remaining</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm">
            <Plus className="h-4 w-4" />
            Add Tier
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</p>
                <p className="mt-1.5 text-2xl font-bold text-surface-900 tracking-tight">{value}</p>
                <p className="mt-0.5 text-xs text-surface-400">{sub}</p>
              </div>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} strokeWidth={1.8} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Ticket tiers table */}
      <div className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-900">Ticket Tiers</h3>
          <span className="text-xs text-surface-400">Total revenue: {gbp(totalRevenue)}</span>
        </div>
        {tiers.length === 0 ? (
          <div className="py-12 text-center">
            <Ticket className="mx-auto h-10 w-10 text-surface-300 mb-3" />
            <p className="text-sm font-medium text-surface-900">No ticket tiers set up yet</p>
            <p className="text-xs text-surface-400 mt-1">Create ticket tiers to start selling.</p>
            <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" />
              Add First Tier
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Tier</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Price</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Sold</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Remaining</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Revenue</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Fill rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {tiers.map((tier, i) => {
                const sold = tier.sold ?? 0;
                const avail = tier.quantity ?? 0;
                const remaining = Math.max(0, avail - sold);
                const fillPct = avail > 0 ? Math.round((sold / avail) * 100) : 0;
                const revenue = sold * (tier.price_cents ?? 0);
                const soldOut = remaining === 0;
                return (
                  <tr key={tier.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-3 w-3 rounded-full ${TIER_COLORS[i % TIER_COLORS.length]}`} />
                        <span className="font-medium text-surface-900">{tier.name ?? "Unnamed tier"}</span>
                        {tier.status === "vip" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">VIP</span>}
                        {soldOut && <span className="rounded-full bg-danger-100 px-2 py-0.5 text-[10px] font-semibold text-danger-700">Sold out</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-surface-900">{gbp(tier.price_cents)}</td>
                    <td className="px-5 py-3 text-right text-surface-700">{sold.toLocaleString("en-GB")}</td>
                    <td className="px-5 py-3 text-right text-surface-700">{remaining.toLocaleString("en-GB")}</td>
                    <td className="px-5 py-3 text-right font-semibold text-surface-900">{gbp(revenue)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-surface-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${TIER_COLORS[i % TIER_COLORS.length]}`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-surface-500 w-8 shrink-0">{fillPct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent orders */}
      <div className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-900">Recent Orders</h3>
          <button className="text-xs text-brand-600 hover:underline">View all orders</button>
        </div>
        {orders.length === 0 ? (
          <p className="px-5 py-4 text-sm text-surface-400">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Buyer</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Tier</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Qty</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Total</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Channel</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-surface-900">{o.buyer_name ?? "—"}</td>
                  <td className="px-5 py-3 text-surface-600">{o.ticket_type_id ? "—" : "—"}</td>
                  <td className="px-5 py-3 text-right text-surface-700">{o.quantity ?? 1}</td>
                  <td className="px-5 py-3 text-right font-semibold text-surface-900">{gbp(o.amount_cents)}</td>
                  <td className="px-5 py-3 text-surface-500 capitalize">Direct</td>
                  <td className="px-5 py-3 text-right text-xs text-surface-400">
                    {o.created_at ? new Date(o.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
