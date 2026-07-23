import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SupplierPaymentsClient } from "./SupplierPaymentsClient";
import type {
  SupplierBillRow,
  SupplierPaymentsKpis,
  SupplierPaymentsInsights,
  FilterOption,
} from "./types";

export const metadata = { title: "Finance — Supplier Payments" };
export const dynamic = "force-dynamic";

const AGING_BUCKETS = [
  { key: "0-30", label: "0–30 days", color: "#f59e0b" },
  { key: "31-60", label: "31–60 days", color: "#f97316" },
  { key: "61-90", label: "61–90 days", color: "#ef4444" },
  { key: "90+", label: "90+ days", color: "#991b1b" },
] as const;

const CATEGORY_COLORS = ["#7c3aed", "#3b82f6", "#f59e0b", "#22c55e", "#ef4444", "#ec4899", "#14b8a6", "#94a3b8"];

const STAGE_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  awaiting_event_manager: "Awaiting Event Manager",
  awaiting_finance: "Awaiting Finance",
};

interface BillQueryRow {
  id: string;
  event_id: string;
  description: string;
  category: string | null;
  amount_cents: number;
  paid_cents: number;
  currency: string;
  expense_date: string | null;
  due_date: string | null;
  bill_number: string | null;
  approval_status: string;
  payment_status: string;
  supplier_id: string | null;
  owner_id: string | null;
  created_at: string;
}

interface PaymentQueryRow {
  id: string;
  expense_id: string;
  amount_cents: number;
  currency: string;
  method: string | null;
  paid_at: string;
  batch_id: string | null;
}

export default async function SupplierPaymentsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: billData }, { data: supplierData }, { data: eventData }] = await Promise.all([
    supabase
      .from("event_expenses")
      .select(
        "id, event_id, description, category, amount_cents, paid_cents, currency, expense_date, due_date, bill_number, approval_status, payment_status, supplier_id, owner_id, created_at"
      )
      .eq("workspace_id", workspaceId)
      .not("supplier_id", "is", null)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("suppliers").select("id, name").eq("workspace_id", workspaceId),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
  ]);

  const bills = (billData ?? []) as BillQueryRow[];
  const billIds = bills.map((b) => b.id);

  const { data: paymentData } =
    billIds.length > 0
      ? await supabase
          .from("event_expense_payments")
          .select("id, expense_id, amount_cents, currency, method, paid_at, batch_id")
          .eq("workspace_id", workspaceId)
          .in("expense_id", billIds)
      : { data: [] as PaymentQueryRow[] };
  const payments = (paymentData ?? []) as PaymentQueryRow[];

  const ownerIds = [...new Set(bills.map((b) => b.owner_id).filter((v): v is string => Boolean(v)))];
  const { data: ownerData } =
    ownerIds.length > 0
      ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ownerIds)
      : { data: [] as { user_id: string; display_name: string | null }[] };

  const supplierName = new Map((supplierData ?? []).map((s) => [s.id, s.name ?? "Unnamed supplier"]));
  const eventName = new Map((eventData ?? []).map((e) => [e.id, e.name]));
  const ownerName = new Map((ownerData ?? []).map((o) => [o.user_id, o.display_name ?? "—"]));

  const balanceOf = (b: BillQueryRow) => b.amount_cents - b.paid_cents;
  const isSettled = (b: BillQueryRow) => b.payment_status === "paid" || b.payment_status === "cancelled";

  // ── KPI row ──────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const now = new Date();

  const outstandingCents = bills.filter((b) => !isSettled(b)).reduce((s, b) => s + balanceOf(b), 0);
  const approvedToPayCents = bills
    .filter((b) => b.approval_status === "approved" && b.payment_status === "unpaid")
    .reduce((s, b) => s + balanceOf(b), 0);
  const paidThisMonthCents = payments
    .filter((p) => {
      const d = new Date(p.paid_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, p) => s + p.amount_cents, 0);
  const overdueCents = bills
    .filter((b) => !isSettled(b) && b.due_date !== null && b.due_date < todayIso)
    .reduce((s, b) => s + balanceOf(b), 0);

  const paymentsByExpense = new Map<string, PaymentQueryRow[]>();
  for (const p of payments) {
    const arr = paymentsByExpense.get(p.expense_id) ?? [];
    arr.push(p);
    paymentsByExpense.set(p.expense_id, arr);
  }
  const paymentTimes: number[] = [];
  for (const b of bills) {
    if (b.payment_status !== "paid") continue;
    const ps = paymentsByExpense.get(b.id);
    if (!ps || ps.length === 0) continue;
    const latest = ps.reduce((a, c) => (new Date(c.paid_at) > new Date(a.paid_at) ? c : a));
    const base = b.due_date ?? b.expense_date;
    if (!base) continue;
    const days = Math.round((new Date(latest.paid_at).getTime() - new Date(base).getTime()) / 86_400_000);
    paymentTimes.push(days);
  }
  const avgPaymentDays =
    paymentTimes.length > 0 ? paymentTimes.reduce((a, b) => a + b, 0) / paymentTimes.length : null;

  const kpis: SupplierPaymentsKpis = {
    outstandingCents,
    approvedToPayCents,
    paidThisMonthCents,
    overdueCents,
    avgPaymentDays,
  };

  // ── Insights rail ────────────────────────────────────────────────────────
  const agingCents: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const b of bills) {
    if (isSettled(b) || !b.due_date) continue;
    const daysOverdue = Math.floor((today.getTime() - new Date(b.due_date).getTime()) / 86_400_000);
    if (daysOverdue <= 0) continue;
    const bucket = daysOverdue <= 30 ? "0-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
    agingCents[bucket] += balanceOf(b);
  }
  const agingTotalCents = Object.values(agingCents).reduce((s, v) => s + v, 0);
  const aging = AGING_BUCKETS.map((b) => ({ ...b, cents: agingCents[b.key] }));

  const categoryTotals = new Map<string, number>();
  for (const b of bills) {
    const cat = b.category ?? "Uncategorised";
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + b.amount_cents);
  }
  const categoryBreakdown = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  const upcomingPayouts = bills
    .filter((b) => b.approval_status === "approved" && b.payment_status === "unpaid")
    .sort((a, b) => (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"))
    .slice(0, 5)
    .map((b) => ({
      id: b.id,
      supplierName: b.supplier_id ? supplierName.get(b.supplier_id) ?? "Unknown supplier" : "Unknown supplier",
      eventName: eventName.get(b.event_id) ?? "Unknown event",
      dueDate: b.due_date,
      balanceCents: balanceOf(b),
    }));

  const pendingApprovalStages = new Set(["pending_review", "awaiting_event_manager", "awaiting_finance"]);
  const pendingBills = bills.filter((b) => pendingApprovalStages.has(b.approval_status));
  const ownedPending = pendingBills.filter((b) => b.owner_id).length;
  const bottlenecksBy: "owner" | "stage" =
    pendingBills.length > 0 && ownedPending / pendingBills.length >= 0.5 ? "owner" : "stage";

  const bottleneckCounts = new Map<string, number>();
  for (const b of pendingBills) {
    const key =
      bottlenecksBy === "owner"
        ? b.owner_id
          ? ownerName.get(b.owner_id) ?? "Unassigned"
          : "Unassigned"
        : STAGE_LABELS[b.approval_status] ?? b.approval_status;
    bottleneckCounts.set(key, (bottleneckCounts.get(key) ?? 0) + 1);
  }
  const bottlenecks = [...bottleneckCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  const insights: SupplierPaymentsInsights = {
    aging,
    agingTotalCents,
    categoryBreakdown,
    upcomingPayouts,
    bottlenecks,
    bottlenecksBy,
  };

  // ── Table rows ───────────────────────────────────────────────────────────
  const rows: SupplierBillRow[] = bills.map((b) => ({
    id: b.id,
    billNumber: b.bill_number,
    supplierId: b.supplier_id ?? "",
    supplierName: b.supplier_id ? supplierName.get(b.supplier_id) ?? "Unknown supplier" : "Unknown supplier",
    eventId: b.event_id,
    eventName: eventName.get(b.event_id) ?? "Unknown event",
    category: b.category ?? "Uncategorised",
    expenseDate: b.expense_date,
    dueDate: b.due_date,
    amountCents: b.amount_cents,
    paidCents: b.paid_cents,
    currency: b.currency || "GBP",
    approvalStatus: b.approval_status,
    paymentStatus: b.payment_status,
    ownerName: b.owner_id ? ownerName.get(b.owner_id) ?? "—" : "—",
  }));

  const supplierOptions: FilterOption[] = [...supplierName.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const eventOptions: FilterOption[] = [...eventName.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const categoryOptions = [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b));

  return (
    <SupplierPaymentsClient
      rows={rows}
      kpis={kpis}
      insights={insights}
      supplierOptions={supplierOptions}
      eventOptions={eventOptions}
      categoryOptions={categoryOptions}
    />
  );
}
