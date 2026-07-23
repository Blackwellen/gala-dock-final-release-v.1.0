import Link from "next/link";
import {
  Banknote,
  Clock,
  XCircle,
  TrendingUp,
  Percent,
  CreditCard,
  Landmark,
  Wallet,
  RefreshCcw,
  Plus,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, FINANCE_TABS } from "@/components/ui/SectionTabs";
import {
  AreaLineChart,
  DonutChart,
  DonutLegend,
  InsightsRail,
  InsightCard,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { InvoicePayment } from "@/lib/supabase/types";
import { paymentBadgeStatus, formatCentsCompact, FINANCE_CHART_COLORS as C } from "../_lib/finance";

export const metadata = { title: "Finance — Payments" };
export const dynamic = "force-dynamic";

type PaymentRow = Pick<
  InvoicePayment,
  "id" | "amount_cents" | "currency" | "method" | "paid_at" | "status" | "created_at" | "invoice_id"
> & {
  invoices: {
    id: string;
    invoice_number: string;
    client_name: string | null;
    event_id: string | null;
    issued_on: string | null;
  } | null;
};

type MethodBucket = "Card" | "Bank" | "Other";

function methodBucket(method: string | null): MethodBucket {
  if (!method) return "Other";
  const m = method.toLowerCase();
  if (m.includes("card") || m.includes("stripe")) return "Card";
  if (m.includes("bank") || m.includes("transfer") || m.includes("bacs") || m.includes("ach")) return "Bank";
  return "Other";
}

function MethodIcon({ method }: { method: string | null }) {
  const bucket = methodBucket(method);
  const Icon = bucket === "Card" ? CreditCard : bucket === "Bank" ? Landmark : Wallet;
  return <Icon className="w-3.5 h-3.5 text-surface-400 shrink-0" strokeWidth={1.8} />;
}

/**
 * Reconciliation is derived, not stored. This schema has no reconciliation
 * column on invoice_payments — a payment is treated as reconciled once
 * Stripe's webhook has confirmed it (status = 'succeeded'); anything still
 * 'pending' is unreconciled. There is no bank-reconciliation workflow here.
 */
function reconciliationStatus(status: string): "reconciled" | "unreconciled" {
  return status === "succeeded" ? "reconciled" : "unreconciled";
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const sp = await searchParams;

  const str = (key: string): string => (typeof sp[key] === "string" ? (sp[key] as string) : "");
  const q = str("q").trim().toLowerCase();
  const methodFilter = str("method");
  const statusFilter = str("status");
  const clientFilter = str("client");
  const eventFilter = str("event");
  const reconFilter = str("recon");
  const dateFrom = str("from");
  const dateTo = str("to");
  const sort = str("sort") || "date_desc";

  const [{ data }, { data: eventNamesData }] = await Promise.all([
    supabase
      .from("invoice_payments")
      .select(
        "id, amount_cents, currency, method, paid_at, status, created_at, invoice_id, invoices(id, invoice_number, client_name, event_id, issued_on)"
      )
      .eq("workspace_id", workspaceId)
      .order("paid_at", { ascending: false }),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
  ]);

  const allPayments = (data ?? []) as unknown as PaymentRow[];
  const eventNames = new Map((eventNamesData ?? []).map((e) => [e.id as string, e.name as string]));

  const clientOptions = [...new Set(allPayments.map((p) => p.invoices?.client_name).filter((c): c is string => !!c))].sort();
  const eventOptions = [...new Set(allPayments.map((p) => p.invoices?.event_id).filter((e): e is string => !!e))]
    .map((id) => ({ id, name: eventNames.get(id) ?? "Unknown event" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtered = allPayments.filter((p) => {
    if (q) {
      const haystack = `${p.id} ${p.invoices?.invoice_number ?? ""} ${p.invoices?.client_name ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (methodFilter && methodBucket(p.method) !== methodFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    if (clientFilter && p.invoices?.client_name !== clientFilter) return false;
    if (eventFilter && p.invoices?.event_id !== eventFilter) return false;
    if (reconFilter && reconciliationStatus(p.status) !== reconFilter) return false;
    const rowDate = p.paid_at ?? p.created_at;
    if (dateFrom && rowDate < dateFrom) return false;
    if (dateTo && rowDate > `${dateTo}T23:59:59`) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "date_asc":
        return new Date(a.paid_at ?? a.created_at).getTime() - new Date(b.paid_at ?? b.created_at).getTime();
      case "amount_desc":
        return b.amount_cents - a.amount_cents;
      case "amount_asc":
        return a.amount_cents - b.amount_cents;
      case "date_desc":
      default:
        return new Date(b.paid_at ?? b.created_at).getTime() - new Date(a.paid_at ?? a.created_at).getTime();
    }
  });

  const hasFilters = Boolean(q || methodFilter || statusFilter || clientFilter || eventFilter || reconFilter || dateFrom || dateTo || (sort && sort !== "date_desc"));

  // ── KPIs — always computed from the full unfiltered workspace dataset ──
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const receivedThisMonth = allPayments.filter(
    (p) => p.status === "succeeded" && p.paid_at && new Date(p.paid_at) >= monthStart
  );
  const receivedThisMonthTotal = receivedThisMonth.reduce((s, p) => s + p.amount_cents, 0);

  const pendingAll = allPayments.filter((p) => p.status === "pending");
  const pendingTotal = pendingAll.reduce((s, p) => s + p.amount_cents, 0);

  const failedOrRefunded = allPayments.filter((p) => p.status === "failed" || p.status === "refunded");
  const failedOrRefundedTotal = failedOrRefunded.reduce((s, p) => s + p.amount_cents, 0);

  const timeToPaySamples = allPayments
    .filter((p) => p.status === "succeeded" && p.paid_at && p.invoices?.issued_on)
    .map((p) => (new Date(p.paid_at as string).getTime() - new Date(p.invoices!.issued_on as string).getTime()) / 86_400_000)
    .filter((days) => Number.isFinite(days) && days >= 0);
  const avgTimeToPay = timeToPaySamples.length > 0 ? timeToPaySamples.reduce((s, d) => s + d, 0) / timeToPaySamples.length : null;

  const methodTotals: Record<MethodBucket, number> = { Card: 0, Bank: 0, Other: 0 };
  for (const p of allPayments) {
    if (p.status !== "succeeded") continue;
    methodTotals[methodBucket(p.method)] += p.amount_cents;
  }
  const methodGrandTotal = methodTotals.Card + methodTotals.Bank + methodTotals.Other;
  const cardPct = methodGrandTotal > 0 ? Math.round((methodTotals.Card / methodGrandTotal) * 100) : 0;
  const bankPct = methodGrandTotal > 0 ? Math.round((methodTotals.Bank / methodGrandTotal) * 100) : 0;

  const methodDonut = [
    { label: "Card", value: methodTotals.Card, color: C.brand },
    { label: "Bank", value: methodTotals.Bank, color: C.info },
    { label: "Other", value: methodTotals.Other, color: C.slate },
  ].filter((d) => d.value > 0);

  // Cash Received Trend — last 8 weeks, succeeded payments only
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = new Date();
    end.setDate(end.getDate() - (7 - i) * 7);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    return { label: `${start.getDate()}/${start.getMonth() + 1}`, start, end };
  });
  const cashTrend = weeks.map((w) => {
    const total = allPayments
      .filter((p) => p.status === "succeeded" && p.paid_at)
      .filter((p) => {
        const d = new Date(p.paid_at as string);
        return d >= w.start && d < w.end;
      })
      .reduce((s, p) => s + p.amount_cents, 0);
    return { label: w.label, received: total / 100 };
  });

  const unreconciledTop5 = allPayments.filter((p) => p.status === "pending").slice(0, 5);
  const recentActivity = [...allPayments].slice(0, 5);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Payments"
        description="Monitor incoming and recorded invoice payments"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/finance/invoices"
              title="Payments are recorded from the relevant invoice's detail page"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Record Payment
            </Link>
            <button
              type="button"
              disabled
              title="Automated bank reconciliation isn't available yet — payments are marked reconciled once Stripe's webhook confirms them"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-surface-50 text-surface-400 text-sm font-medium cursor-not-allowed"
            >
              <RefreshCcw className="w-4 h-4" />
              Reconcile
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Received This Month"
            value={formatCentsCompact(receivedThisMonthTotal)}
            icon={Banknote}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Pending Reconciliation"
            value={`${pendingAll.length} · ${formatCentsCompact(pendingTotal)}`}
            icon={Clock}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
          <MetricCard
            label="Failed / Refunded"
            value={`${failedOrRefunded.length} · ${formatCentsCompact(failedOrRefundedTotal)}`}
            icon={XCircle}
            iconColor="text-danger-600"
            iconBg="bg-danger-50"
          />
          <MetricCard
            label="Avg Time to Pay"
            value={avgTimeToPay !== null ? `${avgTimeToPay.toFixed(1)}d` : "—"}
            icon={TrendingUp}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
          <MetricCard
            label="Card vs Bank Split"
            value={methodGrandTotal > 0 ? `${cardPct}% / ${bankPct}%` : "—"}
            icon={Percent}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
        </KPIGrid>
        <p className="text-xs text-surface-400 -mt-3">
          Reconciliation is derived, not a separate workflow: a payment shows{" "}
          <StatusBadge status="reconciled" /> once Stripe&rsquo;s webhook confirms it (status &ldquo;succeeded&rdquo;), and{" "}
          <StatusBadge status="unreconciled" /> while it&rsquo;s still &ldquo;pending&rdquo;. There is no bank-reconciliation
          feature in this build.
        </p>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <form
              method="get"
              className="bg-white rounded-xl border border-surface-200 shadow-card p-4 flex flex-wrap items-end gap-3"
            >
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-surface-500 mb-1">Search</label>
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Payment ID, invoice no. or client"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Method</label>
                <select
                  name="method"
                  defaultValue={methodFilter}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All methods</option>
                  <option value="Card">Card</option>
                  <option value="Bank">Bank</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Status</label>
                <select
                  name="status"
                  defaultValue={statusFilter}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="succeeded">Succeeded</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Client</label>
                <select
                  name="client"
                  defaultValue={clientFilter}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All clients</option>
                  {clientOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Event</label>
                <select
                  name="event"
                  defaultValue={eventFilter}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All events</option>
                  {eventOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Reconciliation</label>
                <select
                  name="recon"
                  defaultValue={reconFilter}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All</option>
                  <option value="reconciled">Reconciled</option>
                  <option value="unreconciled">Unreconciled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">From</label>
                <input
                  type="date"
                  name="from"
                  defaultValue={dateFrom}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">To</label>
                <input
                  type="date"
                  name="to"
                  defaultValue={dateTo}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1">Sort</label>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="date_desc">Newest first</option>
                  <option value="date_asc">Oldest first</option>
                  <option value="amount_desc">Amount: high to low</option>
                  <option value="amount_asc">Amount: low to high</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  Apply
                </button>
                {hasFilters && (
                  <Link
                    href="/event-manager/finance/payments"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-surface-200 text-surface-500 text-sm hover:bg-surface-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </Link>
                )}
              </div>
            </form>

            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
                <h2 className="text-sm font-semibold text-surface-900">
                  {sorted.length} {sorted.length === 1 ? "payment" : "payments"}
                </h2>
                {hasFilters && (
                  <span className="text-xs text-surface-400">Filtered from {allPayments.length} total</span>
                )}
              </div>

              {sorted.length === 0 ? (
                <EmptyState
                  icon={CreditCard}
                  title={allPayments.length === 0 ? "No payments yet" : "No payments match these filters"}
                  description={
                    allPayments.length === 0
                      ? "Payments recorded against invoices will appear here once clients pay."
                      : "Try clearing or adjusting the filters above."
                  }
                  compact
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Payment</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Client / Event</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Method</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Received On</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Reconciliation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {sorted.map((pay) => {
                        const eventName = pay.invoices?.event_id ? eventNames.get(pay.invoices.event_id) : null;
                        return (
                          <tr key={pay.id} className="hover:bg-surface-50 transition-colors">
                            <td className="px-6 py-3 font-mono text-xs text-surface-500">{pay.id.slice(0, 8)}</td>
                            <td className="px-6 py-3 font-mono text-xs text-surface-500">
                              {pay.invoices ? (
                                <Link href={`/event-manager/finance/invoices/${pay.invoices.id}`} className="hover:text-brand-600">
                                  {pay.invoices.invoice_number}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-6 py-3 text-surface-600">
                              <div className="font-medium text-surface-900">{pay.invoices?.client_name ?? "—"}</div>
                              {eventName && <div className="text-xs text-surface-400">{eventName}</div>}
                            </td>
                            <td className="px-6 py-3">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                                <MethodIcon method={pay.method} />
                                {pay.method ?? "—"}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-surface-500">{formatDate(pay.paid_at ?? pay.created_at)}</td>
                            <td className="px-6 py-3 text-right font-semibold text-surface-900 tabular-nums">
                              {formatCurrency(pay.amount_cents / 100, pay.currency)}
                            </td>
                            <td className="px-6 py-3"><StatusBadge status={paymentBadgeStatus(pay.status)} /></td>
                            <td className="px-6 py-3"><StatusBadge status={reconciliationStatus(pay.status)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Payments by Method">
              {methodDonut.length === 0 ? (
                <p className="text-xs text-surface-400">No succeeded payments yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <DonutChart data={methodDonut} centerValue={formatCentsCompact(methodGrandTotal)} centerLabel="Total" size={140} thickness={20} />
                  <div className="flex-1 min-w-0">
                    <DonutLegend data={methodDonut} formatValue={(v) => formatCentsCompact(v)} />
                  </div>
                </div>
              )}
            </InsightCard>

            <InsightCard title="Cash Received Trend">
              <AreaLineChart
                data={cashTrend}
                series={[{ key: "received", color: C.success, label: "Received", area: true }]}
                formatValue={(v) => formatCurrency(v)}
                height={140}
              />
            </InsightCard>

            <InsightCard
              title="Unreconciled Payments"
              action={
                <Link href="/event-manager/finance/payments?status=pending" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  View all
                </Link>
              }
            >
              {unreconciledTop5.length === 0 ? (
                <p className="text-xs text-surface-400">Nothing pending — all payments are reconciled.</p>
              ) : (
                <ul className="space-y-3">
                  {unreconciledTop5.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning-500 shrink-0" />
                        <span className="truncate text-surface-600">{p.invoices?.client_name ?? p.invoices?.invoice_number ?? "Unknown"}</span>
                      </span>
                      <span className="font-semibold tabular-nums shrink-0">{formatCurrency(p.amount_cents / 100, p.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Recent Payment Activity">
              {recentActivity.length === 0 ? (
                <p className="text-xs text-surface-400">No payment activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {recentActivity.map((p) => (
                    <li key={p.id} className="text-xs">
                      <p className="text-surface-700">
                        {p.status === "succeeded"
                          ? "Payment received from "
                          : p.status === "failed"
                          ? "Payment failed from "
                          : p.status === "refunded"
                          ? "Payment refunded to "
                          : "Payment pending from "}
                        <span className="font-medium text-surface-900">{p.invoices?.client_name ?? "Unknown"}</span>
                      </p>
                      <p className="text-surface-400 flex items-center justify-between mt-0.5">
                        <span>{formatCurrency(p.amount_cents / 100, p.currency)}</span>
                        <span>{timeAgo(p.paid_at ?? p.created_at)}</span>
                      </p>
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
