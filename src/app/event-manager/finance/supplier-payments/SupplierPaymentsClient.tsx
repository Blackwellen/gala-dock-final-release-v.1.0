"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Plus,
  Layers,
  Receipt,
  Check,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTabs, FINANCE_TABS } from "@/components/ui/SectionTabs";
import {
  DonutChart,
  DonutLegend,
  StackedBarChart,
  InsightsRail,
  InsightCard,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency } from "@/lib/utils";
import { formatCentsCompact, billApprovalBadgeStatus, billPaymentBadgeStatus, dueLabel } from "../_lib/finance";
import { approveSupplierBill, rejectSupplierBill, batchPaySupplierBills, getRemittanceDownloadUrl } from "./actions";
import type {
  SupplierBillRow,
  SupplierPaymentsKpis,
  SupplierPaymentsInsights,
  FilterOption,
} from "./types";

const APPROVAL_STATUSES = [
  "pending_review",
  "awaiting_event_manager",
  "awaiting_finance",
  "approved",
  "rejected",
  "disputed",
  "on_hold",
] as const;

const APPROVAL_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  awaiting_event_manager: "Awaiting Event Manager",
  awaiting_finance: "Awaiting Finance",
  approved: "Approved",
  rejected: "Rejected",
  disputed: "Disputed",
  on_hold: "On Hold",
};

const PAYMENT_STATUSES = [
  "unpaid",
  "scheduled",
  "processing",
  "part_paid",
  "paid",
  "failed",
  "refunded",
  "cancelled",
] as const;

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  scheduled: "Scheduled",
  processing: "Processing",
  part_paid: "Part Paid",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

type DueFilter = "" | "overdue" | "next7" | "next30";
type QuickView = "all" | "needs-approval" | "overdue" | "approved-to-pay";

interface Props {
  rows: SupplierBillRow[];
  kpis: SupplierPaymentsKpis;
  insights: SupplierPaymentsInsights;
  supplierOptions: FilterOption[];
  eventOptions: FilterOption[];
  categoryOptions: string[];
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const inputCls =
  "rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs text-surface-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function SupplierPaymentsClient({ rows, kpis, insights, supplierOptions, eventOptions, categoryOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [downloadPending, setDownloadPending] = useState(false);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("");
  const [sortKey, setSortKey] = useState<"due" | "amount" | "supplier" | "approval">("due");
  const [quickView, setQuickView] = useState<QuickView>("all");

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const next7Iso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const next30Iso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const isEligibleForBatch = (r: SupplierBillRow) => r.approvalStatus === "approved" && r.paymentStatus === "unpaid";

  function applyQuickView(view: QuickView) {
    setQuickView(view);
    setApprovalFilter("");
    setPaymentFilter("");
    setDueFilter("");
    if (view === "needs-approval") setApprovalFilter("pending_review");
    if (view === "overdue") setDueFilter("overdue");
    if (view === "approved-to-pay") {
      setApprovalFilter("approved");
      setPaymentFilter("unpaid");
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (q) {
        const haystack = `${r.billNumber ?? r.id.slice(0, 8)} ${r.supplierName} ${r.eventName} ${r.category}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (supplierFilter && r.supplierId !== supplierFilter) return false;
      if (eventFilter && r.eventId !== eventFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (approvalFilter && r.approvalStatus !== approvalFilter) return false;
      if (paymentFilter && r.paymentStatus !== paymentFilter) return false;
      if (dueFilter === "overdue") {
        const settled = r.paymentStatus === "paid" || r.paymentStatus === "cancelled";
        if (settled || !r.dueDate || r.dueDate >= todayIso) return false;
      } else if (dueFilter === "next7") {
        if (!r.dueDate || r.dueDate < todayIso || r.dueDate > next7Iso) return false;
      } else if (dueFilter === "next30") {
        if (!r.dueDate || r.dueDate < todayIso || r.dueDate > next30Iso) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "amount":
          return b.amountCents - b.paidCents - (a.amountCents - a.paidCents);
        case "supplier":
          return a.supplierName.localeCompare(b.supplierName);
        case "approval":
          return a.approvalStatus.localeCompare(b.approvalStatus);
        case "due":
        default:
          return (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");
      }
    });

    return list;
  }, [rows, search, supplierFilter, eventFilter, categoryFilter, approvalFilter, paymentFilter, dueFilter, sortKey, todayIso, next7Iso, next30Iso]);

  const eligibleVisible = filteredRows.filter(isEligibleForBatch);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const allSelected = eligibleVisible.length > 0 && eligibleVisible.every((r) => prev.has(r.id));
      if (allSelected) {
        const next = new Set(prev);
        eligibleVisible.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      eligibleVisible.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function handleApprove(id: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await approveSupplierBill(id);
        setMessage({ type: "success", text: "Bill approved." });
        router.refresh();
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Could not approve bill" });
      }
    });
  }

  function handleReject(id: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await rejectSupplierBill(id);
        setMessage({ type: "success", text: "Bill rejected." });
        router.refresh();
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Could not reject bill" });
      }
    });
  }

  function handleBatchPay() {
    if (selectedIds.size === 0) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const ids = [...selectedIds];
        const res = await batchPaySupplierBills(ids);
        setMessage({ type: "success", text: `Payment run started for ${ids.length} bill${ids.length === 1 ? "" : "s"} (batch ${res.reference}).` });
        setLastBatchId(res.batchId);
        setSelectedIds(new Set());
        setBatchMode(false);
        router.refresh();
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Could not start the payment run" });
      }
    });
  }

  async function handleDownloadRemittance() {
    if (!lastBatchId) return;
    setDownloadPending(true);
    try {
      const url = await getRemittanceDownloadUrl(lastBatchId);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setMessage({ type: "error", text: "No remittance document is available for this batch (R2 storage isn't configured in this environment)." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to get download link" });
    } finally {
      setDownloadPending(false);
    }
  }

  const selectedTotalCents = rows
    .filter((r) => selectedIds.has(r.id))
    .reduce((s, r) => s + (r.amountCents - r.paidCents), 0);

  const donutData = insights.categoryBreakdown.map((c) => ({ label: c.label, value: c.value / 100, color: c.color }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Supplier Payments"
        description="Accounts payable — supplier bills, approvals and payment runs"
        tabs={<SectionTabs tabs={FINANCE_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/finance/supplier-payments/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Supplier Bill
            </Link>
            <button
              type="button"
              onClick={() => {
                setBatchMode((v) => !v);
                setSelectedIds(new Set());
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                batchMode
                  ? "bg-surface-200 text-surface-700 hover:bg-surface-300"
                  : "bg-brand-600 text-white hover:bg-brand-700"
              }`}
            >
              <Layers className="w-4 h-4" />
              {batchMode ? "Cancel Batch Pay" : "Batch Pay"}
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {message && (
          <p
            className={`rounded-md border px-3 py-2 text-sm flex items-center justify-between gap-3 ${
              message.type === "success"
                ? "border-success-200 bg-success-50 text-success-700"
                : "border-danger-200 bg-danger-50 text-danger-700"
            }`}
          >
            <span>{message.text}</span>
            {message.type === "success" && lastBatchId && (
              <button
                type="button"
                onClick={handleDownloadRemittance}
                disabled={downloadPending}
                className="shrink-0 text-xs font-semibold underline hover:no-underline disabled:opacity-50"
              >
                {downloadPending ? "Preparing…" : "Download remittance advice"}
              </button>
            )}
          </p>
        )}

        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Supplier Bills Outstanding"
            value={formatCentsCompact(kpis.outstandingCents)}
            icon={Banknote}
            iconColor="text-warning-600"
            iconBg="bg-warning-50"
          />
          <MetricCard
            label="Approved to Pay"
            value={formatCentsCompact(kpis.approvedToPayCents)}
            icon={CheckCircle2}
            iconColor="text-brand-600"
            iconBg="bg-brand-50"
          />
          <MetricCard
            label="Paid This Month"
            value={formatCentsCompact(kpis.paidThisMonthCents)}
            icon={Receipt}
            iconColor="text-success-600"
            iconBg="bg-success-50"
          />
          <MetricCard
            label="Overdue Supplier Bills"
            value={formatCentsCompact(kpis.overdueCents)}
            icon={AlertTriangle}
            iconColor="text-danger-600"
            iconBg="bg-danger-50"
          />
          <MetricCard
            label="Average Payment Time"
            value={kpis.avgPaymentDays === null ? "—" : `${kpis.avgPaymentDays.toFixed(1)} days`}
            icon={Timer}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            {/* Toolbar */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bill, supplier, event or category…"
                  className={`${inputCls} w-full sm:w-64`}
                />
                <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={inputCls}>
                  <option value="">All suppliers</option>
                  {supplierOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={inputCls}>
                  <option value="">All events</option>
                  {eventOptions.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputCls}>
                  <option value="">All categories</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} className={inputCls}>
                  <option value="">All approval statuses</option>
                  {APPROVAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{APPROVAL_LABELS[s]}</option>
                  ))}
                </select>
                <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className={inputCls}>
                  <option value="">All payment statuses</option>
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{PAYMENT_LABELS[s]}</option>
                  ))}
                </select>
                <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value as DueFilter)} className={inputCls}>
                  <option value="">Any due date</option>
                  <option value="overdue">Overdue</option>
                  <option value="next7">Due in 7 days</option>
                  <option value="next30">Due in 30 days</option>
                </select>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className={inputCls}>
                  <option value="due">Sort: Due date</option>
                  <option value="amount">Sort: Balance</option>
                  <option value="supplier">Sort: Supplier</option>
                  <option value="approval">Sort: Approval status</option>
                </select>
              </div>

              {/* Saved Views — client-side quick filters only; not persisted server-side (no saved-view table backs this tab yet). */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-400 mr-1">Saved views</span>
                {(
                  [
                    { id: "all" as QuickView, label: "All" },
                    { id: "needs-approval" as QuickView, label: "Needs Approval" },
                    { id: "overdue" as QuickView, label: "Overdue" },
                    { id: "approved-to-pay" as QuickView, label: "Approved to Pay" },
                  ]
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => applyQuickView(v.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      quickView === v.id
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "bg-white border-surface-200 text-surface-600 hover:bg-surface-50"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Batch pay bar */}
            {batchMode && (
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-sm text-brand-800">
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    className="px-2 py-1 rounded border border-brand-300 bg-white text-xs font-medium hover:bg-brand-50"
                  >
                    {eligibleVisible.length > 0 && eligibleVisible.every((r) => selectedIds.has(r.id))
                      ? "Deselect all eligible"
                      : "Select all eligible"}
                  </button>
                  <span>
                    {selectedIds.size} bill{selectedIds.size === 1 ? "" : "s"} selected · {formatCurrency(selectedTotalCents / 100)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || pending}
                  onClick={handleBatchPay}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Layers className="w-4 h-4" />
                  {pending ? "Starting payment run…" : "Confirm Batch Pay"}
                </button>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              {filteredRows.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title={rows.length === 0 ? "No supplier bills yet" : "No bills match your filters"}
                  description={
                    rows.length === 0
                      ? "Add a supplier bill to start tracking accounts payable."
                      : "Try clearing search, filters or the selected saved view."
                  }
                  action={
                    rows.length === 0 ? (
                      <Link
                        href="/event-manager/finance/supplier-payments/new"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
                      >
                        <Plus className="w-4 h-4" />
                        Add Supplier Bill
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm divide-y divide-surface-100">
                    <thead className="bg-surface-50 border-b border-surface-200">
                      <tr>
                        {batchMode && <th className="px-3 py-3 w-8" />}
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Bill ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Supplier</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Linked Event</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Issue Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due Date</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Approval</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Payment</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Owner</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {filteredRows.map((r) => {
                        const balance = r.amountCents - r.paidCents;
                        const overdue =
                          r.dueDate !== null &&
                          r.dueDate < todayIso &&
                          r.paymentStatus !== "paid" &&
                          r.paymentStatus !== "cancelled";
                        const eligible = isEligibleForBatch(r);
                        return (
                          <tr key={r.id} className="hover:bg-surface-50 transition-colors">
                            {batchMode && (
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  disabled={!eligible}
                                  checked={selectedIds.has(r.id)}
                                  onChange={() => toggleSelected(r.id)}
                                  className="rounded border-surface-300 disabled:opacity-30"
                                  aria-label={`Select bill ${r.billNumber ?? r.id.slice(0, 8)} for batch pay`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 font-mono text-xs text-surface-500">
                              {r.billNumber ?? r.id.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3 font-medium text-surface-900">{r.supplierName}</td>
                            <td className="px-4 py-3 text-surface-600">{r.eventName}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-100 text-surface-600 border border-surface-200">
                                {r.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-surface-500">{fmtDate(r.expenseDate)}</td>
                            <td className="px-4 py-3">
                              <span className={overdue ? "text-danger-600 font-medium" : "text-surface-500"}>
                                {fmtDate(r.dueDate)}
                              </span>
                              <span className="block text-[11px] text-surface-400">{dueLabel(r.dueDate)}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-surface-900 tabular-nums">
                              {formatCurrency(balance / 100, r.currency)}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={billApprovalBadgeStatus(r.approvalStatus)} />
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={billPaymentBadgeStatus(r.paymentStatus)} />
                            </td>
                            <td className="px-4 py-3 text-surface-500">{r.ownerName}</td>
                            <td className="px-4 py-3">
                              {r.approvalStatus === "pending_review" ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => handleApprove(r.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-success-700 hover:bg-success-50 disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => handleReject(r.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="block text-right text-surface-300 text-xs">—</span>
                              )}
                            </td>
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
            <InsightCard title="Payables Aging">
              <StackedBarChart
                groups={insights.aging.map((b) => ({
                  label: b.label,
                  segments: [{ key: b.key, label: b.label, value: b.cents / 100, color: b.color }],
                }))}
                orientation="horizontal"
                height={140}
                formatValue={(v) => formatCurrency(v)}
              />
              <div className="pt-2 mt-2 border-t border-surface-100 flex justify-between text-xs">
                <span className="text-surface-500">Total overdue</span>
                <span className="font-semibold text-surface-800">{formatCentsCompact(insights.agingTotalCents)}</span>
              </div>
            </InsightCard>

            <InsightCard title="Spend by Supplier Category">
              {insights.categoryBreakdown.length === 0 ? (
                <p className="text-xs text-surface-400">No supplier spend recorded yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <DonutChart data={donutData} centerValue={formatCentsCompact(insights.categoryBreakdown.reduce((s, c) => s + c.value, 0))} centerLabel="Spend" size={140} thickness={20} />
                  <div className="flex-1">
                    <DonutLegend data={donutData} formatValue={(v) => formatCurrency(v)} />
                  </div>
                </div>
              )}
            </InsightCard>

            <InsightCard title="Upcoming Payouts">
              {insights.upcomingPayouts.length === 0 ? (
                <p className="text-xs text-surface-400">No approved bills waiting to be paid.</p>
              ) : (
                <ul className="space-y-2.5">
                  {insights.upcomingPayouts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-surface-800 truncate">{p.supplierName}</p>
                        <p className="text-surface-400 truncate">{p.eventName} · {fmtDate(p.dueDate)}</p>
                      </div>
                      <span className="font-semibold text-surface-900 tabular-nums shrink-0">
                        {formatCurrency(p.balanceCents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title={insights.bottlenecksBy === "owner" ? "Approval Bottlenecks — by Owner" : "Approval Bottlenecks — by Stage"}>
              {insights.bottlenecks.length === 0 ? (
                <p className="text-xs text-surface-400">No bills awaiting approval.</p>
              ) : (
                <ul className="space-y-2">
                  {insights.bottlenecks.map((b, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-surface-600 truncate">{b.label}</span>
                      <span className="font-semibold text-surface-800 tabular-nums">{b.count}</span>
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
