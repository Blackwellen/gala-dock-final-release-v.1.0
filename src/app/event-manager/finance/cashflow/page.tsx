import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import CashflowClient, { type InflowItem, type OutflowItem } from "./CashflowClient";

export const metadata = { title: "Finance — Cashflow" };
export const dynamic = "force-dynamic";

/**
 * Cashflow forecast — computed at query time from existing ledgers. There is
 * no dedicated cashflow table in this schema.
 *
 * INFLOWS (receivables, forward-looking):
 *   - `invoices` where `total_cents - paid_cents > 0` (due_on = expected receipt date)
 *   - `event_deposits` where `amount_cents - paid_cents > 0` (due_date = expected date)
 *   `ticket_orders` are intentionally excluded: paid ticket orders are already-settled,
 *   near-immediate cash, not a forward-looking receivable — they're already reflected
 *   on the Overview and Ticket Sales tabs.
 *
 * OUTFLOWS (payables, forward-looking):
 *   - `event_expenses` where `amount_cents - paid_cents > 0` AND `supplier_id IS NOT NULL`
 *     (due_date = expected payment date)
 *   - `timesheets` where `approval_status = 'approved'` (cost not yet paid; the
 *     `timesheets.approval_status` enum includes a `paid` terminal state, so
 *     `approved` reliably means "owed but unpaid"). Cost = (actual_hours - overtime_hours)
 *     * hourly_rate_cents + overtime_hours * overtime_rate_cents; due date = pay_period_end.
 *
 * Every item's raw balance/cost is computed here, once, server-side. All window
 * bucketing, scenario percentage adjustments and filter interactions happen
 * client-side in CashflowClient over this same real data — no re-fetching.
 */

interface InvoiceRow {
  id: string;
  event_id: string | null;
  client_name: string | null;
  invoice_number: string;
  total_cents: number;
  paid_cents: number;
  due_on: string | null;
  status: string;
  created_by: string | null;
}

interface DepositRow {
  id: string;
  event_id: string;
  label: string;
  amount_cents: number;
  paid_cents: number;
  due_date: string | null;
  status: string;
  created_by: string | null;
}

interface ExpenseRow {
  id: string;
  event_id: string;
  description: string;
  amount_cents: number;
  paid_cents: number;
  due_date: string | null;
  supplier_id: string | null;
  created_by: string | null;
}

interface TimesheetRow {
  id: string;
  event_id: string;
  team_member_name: string;
  approval_status: string;
  actual_hours: number;
  overtime_hours: number;
  hourly_rate_cents: number;
  overtime_rate_cents: number;
  pay_period_end: string;
  created_by: string | null;
}

function timesheetCostCents(t: Pick<TimesheetRow, "actual_hours" | "overtime_hours" | "hourly_rate_cents" | "overtime_rate_cents">): number {
  const straightHours = Math.max(0, t.actual_hours - t.overtime_hours);
  return Math.round(straightHours * t.hourly_rate_cents + t.overtime_hours * t.overtime_rate_cents);
}

export default async function CashflowPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [
    { data: invoiceData },
    { data: depositData },
    { data: expenseData },
    { data: allExpenseData },
    { data: timesheetData },
    { data: eventData },
    { data: supplierData },
    { data: memberData },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, event_id, client_name, invoice_number, total_cents, paid_cents, due_on, status, created_by")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .neq("status", "void"),
    supabase
      .from("event_deposits")
      .select("id, event_id, label, amount_cents, paid_cents, due_date, status, created_by")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("event_expenses")
      .select("id, event_id, description, amount_cents, paid_cents, due_date, supplier_id, created_by")
      .eq("workspace_id", workspaceId)
      .not("supplier_id", "is", null),
    // Unbounded ledger (all supplier bills, paid or not) — used only to compute
    // "committed costs as a % of total historical outflow", never shown as a
    // fabricated forecast figure.
    supabase.from("event_expenses").select("paid_cents").eq("workspace_id", workspaceId),
    supabase
      .from("timesheets")
      .select("id, event_id, team_member_name, approval_status, actual_hours, overtime_hours, hourly_rate_cents, overtime_rate_cents, pay_period_end, created_by")
      .eq("workspace_id", workspaceId),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId).is("deleted_at", null),
    supabase.from("suppliers").select("id, name").eq("workspace_id", workspaceId),
    supabase.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).is("deleted_at", null),
  ]);

  const invoices = (invoiceData ?? []) as InvoiceRow[];
  const deposits = (depositData ?? []) as DepositRow[];
  const expenses = (expenseData ?? []) as ExpenseRow[];
  const allExpensePaid = ((allExpenseData ?? []) as { paid_cents: number }[]).reduce((s, e) => s + (e.paid_cents ?? 0), 0);
  const timesheets = (timesheetData ?? []) as TimesheetRow[];
  const events = (eventData ?? []) as { id: string; name: string }[];
  const suppliers = (supplierData ?? []) as { id: string; name: string }[];

  const eventNameById = new Map(events.map((e) => [e.id, e.name]));
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

  // Owner display names — same pattern used on the Quotes tab: resolve
  // workspace member profiles, keyed by `created_by` (the one owner-ish
  // column present on every source table used here).
  const memberIds = ((memberData ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const ownerNameById = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", memberIds);
    for (const p of profiles ?? []) {
      if (p.display_name) ownerNameById.set(p.user_id, p.display_name);
    }
  }

  // ── Inflow items (open receivables) ─────────────────────────────────────
  const inflowItems: InflowItem[] = [];

  for (const inv of invoices) {
    const balance = inv.total_cents - inv.paid_cents;
    if (balance <= 0) continue;
    inflowItems.push({
      id: inv.id,
      kind: "invoice",
      eventId: inv.event_id,
      ownerId: inv.created_by,
      ownerName: inv.created_by ? ownerNameById.get(inv.created_by) ?? null : null,
      description: inv.client_name ? `Invoice ${inv.invoice_number} — ${inv.client_name}` : `Invoice ${inv.invoice_number}`,
      partyLabel: inv.event_id ? eventNameById.get(inv.event_id) ?? "Unknown event" : "—",
      dueDate: inv.due_on,
      amountCents: balance,
    });
  }

  for (const dep of deposits) {
    const balance = dep.amount_cents - dep.paid_cents;
    if (balance <= 0) continue;
    if (dep.status === "refunded") continue;
    inflowItems.push({
      id: dep.id,
      kind: "deposit",
      eventId: dep.event_id,
      ownerId: dep.created_by,
      ownerName: dep.created_by ? ownerNameById.get(dep.created_by) ?? null : null,
      description: dep.label,
      partyLabel: eventNameById.get(dep.event_id) ?? "Unknown event",
      dueDate: dep.due_date,
      amountCents: balance,
    });
  }

  // ── Outflow items (open payables) ───────────────────────────────────────
  const outflowItems: OutflowItem[] = [];

  for (const exp of expenses) {
    const balance = exp.amount_cents - exp.paid_cents;
    if (balance <= 0) continue;
    outflowItems.push({
      id: exp.id,
      kind: "expense",
      eventId: exp.event_id,
      ownerId: exp.created_by,
      ownerName: exp.created_by ? ownerNameById.get(exp.created_by) ?? null : null,
      description: exp.description,
      partyLabel: (exp.supplier_id && supplierNameById.get(exp.supplier_id)) || eventNameById.get(exp.event_id) || "Unknown supplier",
      dueDate: exp.due_date,
      amountCents: balance,
    });
  }

  for (const t of timesheets) {
    if (t.approval_status !== "approved") continue;
    const cost = timesheetCostCents(t);
    if (cost <= 0) continue;
    outflowItems.push({
      id: t.id,
      kind: "timesheet",
      eventId: t.event_id,
      ownerId: t.created_by,
      ownerName: t.created_by ? ownerNameById.get(t.created_by) ?? null : null,
      description: `${t.team_member_name} — timesheet`,
      partyLabel: eventNameById.get(t.event_id) ?? "Unknown event",
      dueDate: t.pay_period_end,
      amountCents: cost,
    });
  }

  const eventOptions = events
    .filter((e) => inflowItems.some((i) => i.eventId === e.id) || outflowItems.some((o) => o.eventId === e.id))
    .map((e) => ({ id: e.id, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const ownerIds = new Set<string>();
  for (const i of [...inflowItems, ...outflowItems]) if (i.ownerId) ownerIds.add(i.ownerId);
  const ownerOptions = [...ownerIds]
    .map((id) => ({ id, name: ownerNameById.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <CashflowClient
      inflowItems={inflowItems}
      outflowItems={outflowItems}
      eventOptions={eventOptions}
      ownerOptions={ownerOptions}
      historicalPaidOutflowCents={allExpensePaid}
    />
  );
}
