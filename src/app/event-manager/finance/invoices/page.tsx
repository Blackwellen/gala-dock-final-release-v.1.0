import Link from "next/link";
import { Plus, Banknote, TrendingUp, Clock, AlertCircle, Percent, CalendarClock, Download, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import {
  DonutChart,
  DonutLegend,
  AreaLineChart,
  InsightsRail,
  InsightCard,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { Invoice, InvoicePayment } from "@/lib/supabase/types";
import { daysUntil, dueLabel, formatCentsCompact, FINANCE_CHART_COLORS as C } from "../_lib/finance";
import { InvoicesTable, type InvoiceRow } from "./InvoicesTable";

export const metadata = { title: "Finance — Invoices" };
export const dynamic = "force-dynamic";

type InvoiceListRow = Pick<
  Invoice,
  | "id"
  | "invoice_number"
  | "client_name"
  | "event_id"
  | "status"
  | "total_cents"
  | "paid_cents"
  | "currency"
  | "due_on"
  | "issued_on"
  | "payment_received_at"
  | "created_at"
>;

type PaymentRow = Pick<InvoicePayment, "id" | "invoice_id" | "amount_cents" | "status" | "paid_at" | "created_at">;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function InvoicesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: invoiceData }, { data: paymentData }, { data: eventData }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, client_name, event_id, status, total_cents, paid_cents, currency, due_on, issued_on, payment_received_at, created_at"
      )
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoice_payments")
      .select("id, invoice_id, amount_cents, status, paid_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
  ]);

  const invoices = (invoiceData ?? []) as InvoiceListRow[];
  const payments = (paymentData ?? []) as PaymentRow[];
  const eventNames = new Map((eventData ?? []).map((e) => [e.id, e.name]));

  // ---- KPIs ----
  const totalInvoiced = invoices.reduce((s, i) => s + i.total_cents, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paid_cents, 0);
  const outstanding = totalInvoiced - totalPaid;
  const overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + (i.total_cents - i.paid_cents), 0);
  const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : null;

  // Avg days to pay: fully-paid invoices only. Prefer payment_received_at; fall back to
  // the most recent succeeded invoice_payments.paid_at for that invoice.
  const succeededPaymentsByInvoice = new Map<string, string>(); // invoice_id -> latest paid_at
  for (const p of payments) {
    if (p.status !== "succeeded" || !p.paid_at) continue;
    const existing = succeededPaymentsByInvoice.get(p.invoice_id);
    if (!existing || p.paid_at > existing) succeededPaymentsByInvoice.set(p.invoice_id, p.paid_at);
  }
  const daysToPaySamples: number[] = [];
  for (const inv of invoices) {
    if (inv.total_cents <= 0 || inv.paid_cents < inv.total_cents) continue;
    if (!inv.issued_on) continue;
    const paidDate = inv.payment_received_at ?? succeededPaymentsByInvoice.get(inv.id);
    if (!paidDate) continue;
    const days = Math.round((new Date(paidDate).getTime() - new Date(inv.issued_on).getTime()) / 86_400_000);
    if (days >= 0) daysToPaySamples.push(days);
  }
  const avgDaysToPay =
    daysToPaySamples.length > 0 ? daysToPaySamples.reduce((s, d) => s + d, 0) / daysToPaySamples.length : null;

  // ---- Aging summary (outstanding balances bucketed by days overdue) ----
  const agingBuckets = [
    { key: "0-30", label: "0–30 days", color: C.info, min: 0, max: 30, value: 0 },
    { key: "31-60", label: "31–60 days", color: C.warning, min: 31, max: 60, value: 0 },
    { key: "61-90", label: "61–90 days", color: C.danger, min: 61, max: 90, value: 0 },
    { key: "90+", label: "90+ days", color: C.slate, min: 91, max: Infinity, value: 0 },
  ];
  for (const inv of invoices) {
    const balance = inv.total_cents - inv.paid_cents;
    if (balance <= 0 || !inv.due_on) continue;
    const overdueDays = Math.max(0, -(daysUntil(inv.due_on) ?? 0));
    const bucket = agingBuckets.find((b) => overdueDays >= b.min && overdueDays <= b.max);
    if (bucket) bucket.value += balance;
  }
  const agingTotal = agingBuckets.reduce((s, b) => s + b.value, 0);

  // ---- Collections trend — payments received per week, last 8 weeks ----
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = new Date();
    end.setDate(end.getDate() - (7 - i) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { label: end.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), start, end };
  });
  const collectionsSeries = weeks.map((w) => {
    const total = payments
      .filter((p) => p.status === "succeeded" && p.paid_at)
      .filter((p) => {
        const d = new Date(p.paid_at as string);
        return d >= w.start && d < w.end;
      })
      .reduce((s, p) => s + p.amount_cents, 0);
    return { label: w.label, collected: total / 100 };
  });

  // ---- Overdue invoices — top 5 by most overdue ----
  const overdueInvoices = invoices
    .filter((i) => (i.total_cents - i.paid_cents) > 0 && i.due_on && (daysUntil(i.due_on) ?? 0) < 0)
    .sort((a, b) => (daysUntil(a.due_on) ?? 0) - (daysUntil(b.due_on) ?? 0))
    .slice(0, 5);

  // ---- Payment activity feed — 5 most recent payments ----
  const recentPayments = payments.slice(0, 5);
  const clientNameByInvoice = new Map(invoices.map((i) => [i.id, i.client_name]));

  const invoiceRows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    clientName: i.client_name,
    eventName: i.event_id ? eventNames.get(i.event_id) ?? null : null,
    status: i.status,
    totalCents: i.total_cents,
    paidCents: i.paid_cents,
    currency: i.currency,
    issuedOn: i.issued_on,
    dueOn: i.due_on,
  }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Invoices"
        description="Issue and track client invoices, payments and collections"
        actions={
          <>
            <button
              type="button"
              title="Export is not wired up yet"
              disabled
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-400 text-sm font-medium cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <Link
              href="/event-manager/finance/invoices/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Invoice
            </Link>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Invoiced" value={formatCentsCompact(totalInvoiced)} icon={Banknote} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Total Paid" value={formatCentsCompact(totalPaid)} icon={TrendingUp} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Outstanding" value={formatCentsCompact(outstanding)} icon={Clock} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Overdue" value={formatCentsCompact(overdue)} icon={AlertCircle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard
            label="Collection Rate"
            value={collectionRate === null ? "—" : `${collectionRate.toFixed(1)}%`}
            icon={Percent}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
          <MetricCard
            label="Avg Days to Pay"
            value={avgDaysToPay === null ? "—" : `${avgDaysToPay.toFixed(1)}d`}
            icon={CalendarClock}
            iconColor="text-teal-600"
            iconBg="bg-teal-50"
          />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <InvoicesTable invoices={invoiceRows} />
            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Aging Summary — Outstanding">
              {agingTotal === 0 ? (
                <p className="text-xs text-surface-400">No outstanding balances.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <DonutChart
                    data={agingBuckets.filter((b) => b.value > 0).map((b) => ({ label: b.label, value: b.value, color: b.color }))}
                    centerValue={formatCentsCompact(agingTotal)}
                    centerLabel="Outstanding"
                    size={140}
                    thickness={20}
                  />
                  <DonutLegend
                    data={agingBuckets.filter((b) => b.value > 0).map((b) => ({ label: b.label, value: b.value, color: b.color }))}
                    formatValue={(v) => formatCentsCompact(v)}
                  />
                </div>
              )}
            </InsightCard>

            <InsightCard title="Collections Trend">
              <AreaLineChart
                data={collectionsSeries}
                series={[{ key: "collected", color: C.success, label: "Collected", area: true }]}
                formatValue={(v) => formatCurrency(v)}
                height={140}
              />
            </InsightCard>

            <InsightCard title="Overdue Invoices">
              {overdueInvoices.length === 0 ? (
                <p className="text-xs text-surface-400">Nothing overdue right now.</p>
              ) : (
                <ul className="space-y-3">
                  {overdueInvoices.map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/event-manager/finance/invoices/${inv.id}`}
                        className="flex items-center justify-between text-xs group"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-surface-800 truncate group-hover:text-brand-700">
                            {inv.client_name ?? inv.invoice_number}
                          </span>
                          <span className="block text-danger-600">{dueLabel(inv.due_on)}</span>
                        </span>
                        <span className="font-semibold tabular-nums text-surface-900 shrink-0 ml-2">
                          {formatCurrency((inv.total_cents - inv.paid_cents) / 100, inv.currency)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Payment Activity">
              {recentPayments.length === 0 ? (
                <p className="text-xs text-surface-400">No payments recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {recentPayments.map((p) => (
                    <li key={p.id} className="flex items-start gap-2 text-xs">
                      <ArrowUpRight className="w-3.5 h-3.5 text-success-500 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-surface-700">
                          Payment received from{" "}
                          <span className="font-medium text-surface-900">
                            {clientNameByInvoice.get(p.invoice_id) ?? "client"}
                          </span>
                        </span>
                        <span className="flex items-center justify-between text-surface-400">
                          <span>{relativeTime(p.paid_at ?? p.created_at)}</span>
                          <span className="font-semibold tabular-nums text-surface-700">
                            {formatCentsCompact(p.amount_cents)}
                          </span>
                        </span>
                      </span>
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
