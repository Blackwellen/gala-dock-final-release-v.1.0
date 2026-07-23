import Link from "next/link";
import {
  Ticket,
  Banknote,
  TrendingUp,
  Percent,
  ReceiptText,
  RotateCcw,
  Plus,
  Store,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { SectionTabs, FINANCE_TABS } from "@/components/ui/SectionTabs";
import {
  AreaLineChart,
  DonutChart,
  DonutLegend,
  GroupedBarChart,
  StackedBarChart,
  ChartCard,
  InsightsRail,
  InsightCard,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { TicketOrder, TicketType } from "@/lib/supabase/types";
import { formatCentsCompact, FINANCE_CHART_COLORS as C } from "../_lib/finance";
import { TicketOrdersTable, type TicketOrderRow } from "./TicketOrdersTable";

export const metadata = { title: "Finance — Ticket Sales" };
export const dynamic = "force-dynamic";

type OrderRow = Pick<
  TicketOrder,
  | "id"
  | "event_id"
  | "ticket_type_id"
  | "buyer_name"
  | "buyer_email"
  | "quantity"
  | "amount_cents"
  | "fee_cents"
  | "refunded_cents"
  | "currency"
  | "channel"
  | "status"
  | "created_at"
>;

type TierRow = Pick<TicketType, "id" | "event_id" | "name" | "price_cents" | "quantity" | "sold" | "status">;

const TIER_COLORS = [C.brand, C.info, C.success, C.warning, C.violet, C.teal, C.pink, C.slate];
const CHANNEL_LABELS: Record<string, string> = {
  website: "Website",
  mobile_app: "Mobile App",
  partner_sites: "Partner Sites",
  box_office: "Box Office",
};

export default async function TicketSalesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: orderData }, { data: tierData }, { data: eventData }] = await Promise.all([
    supabase
      .from("ticket_orders")
      .select(
        "id, event_id, ticket_type_id, buyer_name, buyer_email, quantity, amount_cents, fee_cents, refunded_cents, currency, channel, status, created_at"
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("ticket_types")
      .select("id, event_id, name, price_cents, quantity, sold, status")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
  ]);

  const orders = (orderData ?? []) as OrderRow[];
  const tiers = (tierData ?? []) as TierRow[];
  const eventNames = new Map((eventData ?? []).map((e) => [e.id, e.name]));
  const tierNames = new Map(tiers.map((t) => [t.id, t.name]));

  // ---- KPIs ----
  const paidOrders = orders.filter((o) => o.status === "paid");
  const refundedOrders = orders.filter((o) => o.status === "refunded");
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");

  const ticketsSold = paidOrders.reduce((s, o) => s + o.quantity, 0);
  const grossSales = paidOrders.reduce((s, o) => s + o.amount_cents, 0);
  const netRevenue = [...paidOrders, ...refundedOrders].reduce(
    (s, o) => s + (o.amount_cents - o.fee_cents - o.refunded_cents),
    0
  );
  const conversionDenominator = paidOrders.length + pendingOrders.length + cancelledOrders.length;
  const conversionRate = conversionDenominator > 0 ? (paidOrders.length / conversionDenominator) * 100 : null;
  const avgOrderValue = paidOrders.length > 0 ? grossSales / paidOrders.length : null;
  const refundRate = orders.length > 0 ? (refundedOrders.length / orders.length) * 100 : null;

  // ---- Sales Trend — Gross vs Net, last 8 weeks ----
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = new Date();
    end.setDate(end.getDate() - (7 - i) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { label: end.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), start, end };
  });
  const salesTrendSeries = weeks.map((w) => {
    const inWindow = (o: OrderRow) => {
      const d = new Date(o.created_at);
      return d >= w.start && d < w.end;
    };
    const gross = orders.filter((o) => o.status === "paid" && inWindow(o)).reduce((s, o) => s + o.amount_cents, 0);
    const net = orders
      .filter((o) => (o.status === "paid" || o.status === "refunded") && inWindow(o))
      .reduce((s, o) => s + (o.amount_cents - o.fee_cents - o.refunded_cents), 0);
    return { label: w.label, gross: gross / 100, net: net / 100 };
  });

  // ---- Ticket Sales by Event (qty, paid orders) ----
  const qtyByEvent = new Map<string, number>();
  for (const o of paidOrders) qtyByEvent.set(o.event_id, (qtyByEvent.get(o.event_id) ?? 0) + o.quantity);
  const salesByEvent = [...qtyByEvent.entries()]
    .map(([eventId, qty]) => ({ label: eventNames.get(eventId) ?? "Unknown", value: qty }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ---- Revenue by Ticket Tier (donut, gross paid) ----
  const revenueByTier = new Map<string, number>();
  for (const o of paidOrders) revenueByTier.set(o.ticket_type_id, (revenueByTier.get(o.ticket_type_id) ?? 0) + o.amount_cents);
  const tierRevenueData = [...revenueByTier.entries()]
    .map(([tierId, value], i) => ({
      label: tierNames.get(tierId) ?? "Unknown Tier",
      value,
      color: TIER_COLORS[i % TIER_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
  const tierRevenueTotal = tierRevenueData.reduce((s, d) => s + d.value, 0);

  // ---- Best Performing Events (net revenue) ----
  const netByEvent = new Map<string, number>();
  for (const o of [...paidOrders, ...refundedOrders]) {
    netByEvent.set(o.event_id, (netByEvent.get(o.event_id) ?? 0) + (o.amount_cents - o.fee_cents - o.refunded_cents));
  }
  const bestEvents = [...netByEvent.entries()]
    .map(([eventId, value]) => ({ eventId, label: eventNames.get(eventId) ?? "Unknown", value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // ---- Ticket Tier Mix (single stacked bar, share of net revenue by tier) ----
  const netByTier = new Map<string, number>();
  for (const o of [...paidOrders, ...refundedOrders]) {
    netByTier.set(o.ticket_type_id, (netByTier.get(o.ticket_type_id) ?? 0) + (o.amount_cents - o.fee_cents - o.refunded_cents));
  }
  const tierMixSegments = [...netByTier.entries()]
    .filter(([, value]) => value > 0)
    .map(([tierId, value], i) => ({
      key: tierId,
      label: tierNames.get(tierId) ?? "Unknown Tier",
      value,
      color: TIER_COLORS[i % TIER_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);

  // ---- Channel Split (donut, gross paid) ----
  const grossByChannel = new Map<string, number>();
  for (const o of paidOrders) grossByChannel.set(o.channel, (grossByChannel.get(o.channel) ?? 0) + o.amount_cents);
  const channelColors: Record<string, string> = {
    website: C.brand,
    mobile_app: C.info,
    partner_sites: C.violet,
    box_office: C.teal,
  };
  const channelSplitData = [...grossByChannel.entries()]
    .map(([channel, value]) => ({
      label: CHANNEL_LABELS[channel] ?? channel,
      value,
      color: channelColors[channel] ?? C.slate,
    }))
    .sort((a, b) => b.value - a.value);

  // ---- Recent Ticketing Alerts (derived from real data — no invented copy) ----
  type Alert = { icon: "warn" | "info"; text: string };
  const alerts: Alert[] = [];
  const soldOutTiers = tiers.filter((t) => t.status === "sold_out");
  for (const t of soldOutTiers.slice(0, 3)) {
    alerts.push({ icon: "warn", text: `${t.name} is sold out for ${eventNames.get(t.event_id) ?? "an event"}.` });
  }
  const ordersByEvent = new Map<string, OrderRow[]>();
  for (const o of orders) {
    const list = ordersByEvent.get(o.event_id) ?? [];
    list.push(o);
    ordersByEvent.set(o.event_id, list);
  }
  for (const [eventId, evOrders] of ordersByEvent) {
    const refunded = evOrders.filter((o) => o.status === "refunded").length;
    const rate = evOrders.length > 0 ? (refunded / evOrders.length) * 100 : 0;
    if (evOrders.length >= 3 && rate > 20) {
      alerts.push({
        icon: "warn",
        text: `Refund rate of ${rate.toFixed(0)}% for ${eventNames.get(eventId) ?? "an event"} — worth reviewing.`,
      });
    }
  }
  if (alerts.length === 0 && bestEvents.length > 0) {
    for (const ev of bestEvents.slice(0, 3)) {
      const qty = qtyByEvent.get(ev.eventId) ?? 0;
      alerts.push({ icon: "info", text: `${qty} ticket${qty === 1 ? "" : "s"} sold for ${ev.label} this period.` });
    }
  }

  // ---- Recent Orders table rows ----
  const orderRows: TicketOrderRow[] = orders.map((o) => ({
    id: o.id,
    orderCode: `#${o.id.slice(0, 8).toUpperCase()}`,
    eventName: eventNames.get(o.event_id) ?? "Unknown",
    buyerName: o.buyer_name ?? o.buyer_email ?? "—",
    tierName: tierNames.get(o.ticket_type_id) ?? "Unknown Tier",
    quantity: o.quantity,
    grossCents: o.amount_cents,
    feeCents: o.fee_cents,
    netCents: o.amount_cents - o.fee_cents - o.refunded_cents,
    currency: o.currency,
    channel: o.channel,
    status: o.status,
    createdAt: o.created_at,
  }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Ticket Sales"
        description="Track ticket revenue, orders and sales performance"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <button
              type="button"
              title="Box Office (in-person sale) is not wired up yet — coming in a later release"
              disabled
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-400 text-sm font-medium cursor-not-allowed"
            >
              <Store className="w-4 h-4" />
              Open Box Office
            </button>
            <Link
              href="/event-manager/finance/ticket-sales/new-tier"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Ticket Tier
            </Link>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Tickets Sold" value={ticketsSold.toLocaleString("en-GB")} icon={Ticket} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Gross Sales" value={formatCentsCompact(grossSales)} icon={Banknote} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Net Revenue" value={formatCentsCompact(netRevenue)} icon={TrendingUp} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard
            label="Conversion Rate"
            value={conversionRate === null ? "—" : `${conversionRate.toFixed(1)}%`}
            icon={Percent}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
          <MetricCard
            label="Avg Order Value"
            value={avgOrderValue === null ? "—" : formatCurrency(avgOrderValue / 100)}
            icon={ReceiptText}
            iconColor="text-teal-600"
            iconBg="bg-teal-50"
          />
          <MetricCard
            label="Refund Rate"
            value={refundRate === null ? "—" : `${refundRate.toFixed(1)}%`}
            icon={RotateCcw}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Sales Trend">
                {salesTrendSeries.every((s) => s.gross === 0 && s.net === 0) ? (
                  <p className="text-xs text-surface-400">No ticket sales recorded in the last 8 weeks.</p>
                ) : (
                  <AreaLineChart
                    data={salesTrendSeries}
                    series={[
                      { key: "gross", color: C.brand, label: "Gross", area: true },
                      { key: "net", color: C.success, label: "Net" },
                    ]}
                    formatValue={(v) => formatCurrency(v)}
                  />
                )}
              </ChartCard>
              <ChartCard title="Ticket Sales by Event">
                {salesByEvent.length === 0 ? (
                  <p className="text-xs text-surface-400">No paid ticket orders yet.</p>
                ) : (
                  <GroupedBarChart
                    groups={salesByEvent.map((r) => ({ label: r.label, bars: [{ key: "qty", value: r.value, color: C.brand }] }))}
                    height={180}
                    formatValue={(v) => `${v.toLocaleString("en-GB")} tickets`}
                  />
                )}
              </ChartCard>
            </div>

            <ChartCard title="Revenue by Ticket Tier">
              {tierRevenueData.length === 0 ? (
                <p className="text-xs text-surface-400">No tier revenue recorded yet.</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <DonutChart data={tierRevenueData} centerValue={formatCentsCompact(tierRevenueTotal)} centerLabel="Gross Sales" />
                  <div className="flex-1 w-full">
                    <DonutLegend data={tierRevenueData} formatValue={(v) => formatCentsCompact(v)} />
                  </div>
                </div>
              )}
            </ChartCard>

            <TicketOrdersTable orders={orderRows} />

            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Best Performing Events">
              {bestEvents.length === 0 ? (
                <p className="text-xs text-surface-400">No net revenue recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {bestEvents.map((ev, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-surface-600 truncate">{ev.label}</span>
                      <span className="font-semibold tabular-nums text-surface-900 shrink-0 ml-2">
                        {formatCentsCompact(ev.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Ticket Tier Mix">
              {tierMixSegments.length === 0 ? (
                <p className="text-xs text-surface-400">No tier revenue recorded yet.</p>
              ) : (
                <>
                  <StackedBarChart
                    groups={[{ label: "All Orders", segments: tierMixSegments }]}
                    orientation="horizontal"
                    showTotals={false}
                    formatValue={(v) => formatCentsCompact(v)}
                  />
                  <ul className="mt-3 space-y-1.5">
                    {tierMixSegments.map((seg) => (
                      <li key={seg.key} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
                          <span className="text-surface-600 truncate">{seg.label}</span>
                        </span>
                        <span className="font-semibold tabular-nums text-surface-800 shrink-0">
                          {formatCentsCompact(seg.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </InsightCard>

            <InsightCard title="Channel Split">
              {channelSplitData.length === 0 ? (
                <p className="text-xs text-surface-400">No channel data yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <DonutChart data={channelSplitData} size={140} thickness={20} />
                  <DonutLegend data={channelSplitData} formatValue={(v) => formatCentsCompact(v)} />
                </div>
              )}
            </InsightCard>

            <InsightCard title="Recent Ticketing Alerts">
              {alerts.length === 0 ? (
                <p className="text-xs text-surface-400">No ticket sales activity to report yet.</p>
              ) : (
                <ul className="space-y-3">
                  {alerts.slice(0, 5).map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${a.icon === "warn" ? "text-warning-500" : "text-brand-400"}`}
                      />
                      <span className="text-surface-700">{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
