"use client";

import { useState, useTransition } from "react";
import { Plus, Paperclip, Pencil, Trash2, X, Receipt } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getReceiptUrl,
  EXPENSE_CATEGORIES,
} from "./actions";

export interface ExpenseRow {
  id: string;
  category: string | null;
  description: string;
  amount_cents: number;
  expense_date: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  receipt_storage_key: string | null;
  status: string;
}

export interface SupplierOption {
  id: string;
  name: string;
}

interface Props {
  eventId: string;
  expenses: ExpenseRow[];
  suppliers: SupplierOption[];
}

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
function gbp(cents: number) {
  return GBP.format((cents ?? 0) / 100);
}

const CATEGORY_LABELS: Record<string, string> = {
  "venue-hire": "Venue Hire",
  catering: "Catering",
  "av-tech": "AV & Tech",
  photography: "Photography",
  floristry: "Floristry",
  entertainment: "Entertainment",
  staffing: "Staffing",
  transport: "Transport",
  stationery: "Stationery",
  accommodation: "Accommodation",
  insurance: "Insurance",
  licences: "Licences",
  miscellaneous: "Miscellaneous",
};

function categoryLabel(c: string | null) {
  if (!c) return "—";
  return CATEGORY_LABELS[c] ?? c;
}

function statusBadge(status: string) {
  if (status === "approved") return <StatusBadge status="approved" />;
  if (status === "reimbursed") return <StatusBadge status="paid" />;
  return <StatusBadge status="draft" dot />;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

export function ExpensesClient({ eventId, expenses, suppliers }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openAdd() {
    setEditing(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(row: ExpenseRow) {
    setEditing(row);
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (editing) {
          await updateExpense(eventId, editing.id, formData);
        } else {
          await createExpense(eventId, formData);
        }
        setShowForm(false);
        setEditing(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save expense");
      }
    });
  }

  function handleDelete(row: ExpenseRow) {
    if (!confirm(`Delete "${row.description}"?`)) return;
    startTransition(async () => {
      try {
        await deleteExpense(eventId, row.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete expense");
      }
    });
  }

  function openReceipt(row: ExpenseRow) {
    startTransition(async () => {
      try {
        const url = await getReceiptUrl(eventId, row.id);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open receipt");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-surface-900">Expense log</h2>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          Add expense
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}

      {expenses.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white">
          <EmptyState
            icon={Receipt}
            title="No expenses recorded yet"
            description="Log actual spend against this event to track budget vs actual and the real margin."
            action={
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" strokeWidth={1.8} />
                Add expense
              </button>
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Description</Th>
                <Th>Supplier</Th>
                <Th className="text-right">Amount</Th>
                <Th>Receipt</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {expenses.map((row) => (
                <tr key={row.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3 text-surface-600 whitespace-nowrap">
                    {fmtDate(row.expense_date)}
                  </td>
                  <td className="px-4 py-3 text-surface-700">{categoryLabel(row.category)}</td>
                  <td className="px-4 py-3 font-medium text-surface-900">{row.description}</td>
                  <td className="px-4 py-3 text-surface-600">{row.supplier_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-surface-900">
                    {gbp(row.amount_cents)}
                  </td>
                  <td className="px-4 py-3">
                    {row.receipt_storage_key ? (
                      <button
                        type="button"
                        onClick={() => openReceipt(row)}
                        className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
                      >
                        <Paperclip className="h-4 w-4" strokeWidth={1.8} />
                        View
                      </button>
                    ) : (
                      <span className="text-surface-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700"
                        aria-label="Edit expense"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        className="rounded p-1.5 text-surface-400 hover:bg-danger-50 hover:text-danger-600"
                        aria-label="Delete expense"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setShowForm(false)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-200 px-5 py-4">
              <h3 className="text-base font-semibold text-surface-900">
                {editing ? "Edit expense" : "Add expense"}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded p-1.5 text-surface-400 hover:bg-surface-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>

            <form action={handleSubmit} className="space-y-4 p-5">
              <Field label="Date">
                <input
                  type="date"
                  name="expense_date"
                  defaultValue={editing?.expense_date ?? ""}
                  className={inputCls}
                />
              </Field>

              <Field label="Category">
                <select
                  name="category"
                  defaultValue={editing?.category ?? "miscellaneous"}
                  className={inputCls}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Description" required>
                <input
                  name="description"
                  required
                  defaultValue={editing?.description ?? ""}
                  placeholder="e.g. Thornbury Castle hire"
                  className={inputCls}
                />
              </Field>

              <Field label="Amount (£)" required>
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={
                    editing ? (editing.amount_cents / 100).toFixed(2) : ""
                  }
                  placeholder="0.00"
                  className={inputCls}
                />
              </Field>

              <Field label="Supplier (optional)">
                <select
                  name="supplier_id"
                  defaultValue={editing?.supplier_id ?? ""}
                  className={inputCls}
                >
                  <option value="">— None —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select
                  name="status"
                  defaultValue={editing?.status ?? "recorded"}
                  className={inputCls}
                >
                  <option value="recorded">Recorded</option>
                  <option value="approved">Approved</option>
                  <option value="reimbursed">Reimbursed</option>
                </select>
              </Field>

              <Field label={editing?.receipt_storage_key ? "Replace receipt" : "Receipt (optional)"}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-surface-300 px-3 py-2.5 text-sm text-surface-500 hover:border-brand-400 hover:text-surface-700">
                  <Paperclip className="h-4 w-4" strokeWidth={1.8} />
                  Choose image or PDF
                  <input type="file" name="receipt" accept="image/*,.pdf" className="hidden" />
                </label>
                {editing?.receipt_storage_key && (
                  <p className="mt-1 text-xs text-surface-400">
                    A receipt is already attached. Uploading a new file replaces it.
                  </p>
                )}
              </Field>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : editing ? "Save changes" : "Add expense"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-medium text-surface-600 hover:bg-surface-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-surface-700">
        {label}
        {required && <span className="text-danger-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-surface-500 ${className}`}
    >
      {children}
    </th>
  );
}
