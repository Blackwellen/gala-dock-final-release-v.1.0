"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Check, Send, Calendar, Wand2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { InvoicePaymentSchedule } from "@/lib/supabase/types";
import {
  createSchedule,
  markScheduleItemPaid,
  deleteSchedule,
  deleteScheduleItem,
  type ScheduleInstallmentInput,
} from "./schedule-actions";

type ScheduleStatusBadge = "pending" | "paid" | "overdue";

/** A schedule item with the overdue flag computed at render time. */
interface ScheduleRow extends InvoicePaymentSchedule {
  effectiveStatus: ScheduleStatusBadge;
}

interface Props {
  invoiceId: string;
  currency: string;
  /** Invoice total in cents — used for preset percentage splits. */
  invoiceTotalCents: number;
  /** Default due date seed (issued date or today, yyyy-mm-dd). */
  baseDate: string;
  schedule: ScheduleRow[];
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(base: string, days: number): string {
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return todayISO();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface DraftRow {
  label: string;
  amount: string; // major units, as typed
  percentage: string;
  dueDate: string;
}

export function PaymentScheduleSection({
  invoiceId,
  currency,
  invoiceTotalCents,
  baseDate,
  schedule,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [reminderCopied, setReminderCopied] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow[]>([]);

  const totalMajor = invoiceTotalCents / 100;
  const paidCents = schedule
    .filter((s) => s.status === "paid")
    .reduce((sum, s) => sum + s.amount_cents, 0);
  const scheduledCents = schedule.reduce((sum, s) => sum + s.amount_cents, 0);
  const paidCount = schedule.filter((s) => s.status === "paid").length;
  const overdueCount = schedule.filter(
    (s) => s.effectiveStatus === "overdue"
  ).length;
  const progressPct =
    scheduledCents > 0
      ? Math.min(100, Math.round((paidCents / scheduledCents) * 100))
      : 0;
  const nextDue = schedule
    .filter((s) => s.status !== "paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  // ── Preset builders ───────────────────────────────────────────────────────
  function presetThirds(): DraftRow[] {
    const deposit = Math.round(totalMajor * 0.33 * 100) / 100;
    const interim = Math.round(totalMajor * 0.33 * 100) / 100;
    const balance = Math.round((totalMajor - deposit - interim) * 100) / 100;
    return [
      { label: "Deposit (33%)", amount: deposit.toFixed(2), percentage: "33", dueDate: todayISO() },
      { label: "Interim Payment (33%)", amount: interim.toFixed(2), percentage: "33", dueDate: addDaysISO(baseDate, 30) },
      { label: "Final Balance (34%)", amount: balance.toFixed(2), percentage: "34", dueDate: addDaysISO(baseDate, 60) },
    ];
  }

  function presetHalves(): DraftRow[] {
    const deposit = Math.round(totalMajor * 0.5 * 100) / 100;
    const balance = Math.round((totalMajor - deposit) * 100) / 100;
    return [
      { label: "Deposit (50%)", amount: deposit.toFixed(2), percentage: "50", dueDate: todayISO() },
      { label: "Final Balance (50%)", amount: balance.toFixed(2), percentage: "50", dueDate: addDaysISO(baseDate, 30) },
    ];
  }

  function presetUpfront(): DraftRow[] {
    return [
      { label: "Full Payment (100%)", amount: totalMajor.toFixed(2), percentage: "100", dueDate: todayISO() },
    ];
  }

  function presetSplitN(n: number): DraftRow[] {
    const each = Math.round((totalMajor / n) * 100) / 100;
    const rows: DraftRow[] = [];
    let allocated = 0;
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      const amount = isLast ? Math.round((totalMajor - allocated) * 100) / 100 : each;
      allocated += amount;
      rows.push({
        label: `Instalment ${i + 1} of ${n}`,
        amount: amount.toFixed(2),
        percentage: (Math.round((100 / n) * 100) / 100).toString(),
        dueDate: addDaysISO(baseDate, i * 30),
      });
    }
    return rows;
  }

  function startBuilder(rows: DraftRow[]) {
    setDraft(rows);
    setBuilding(true);
    setError(null);
  }

  function updateDraftRow(index: number, patch: Partial<DraftRow>) {
    setDraft((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addDraftRow() {
    setDraft((prev) => [
      ...prev,
      { label: "", amount: "", percentage: "", dueDate: addDaysISO(baseDate, prev.length * 30) },
    ]);
  }

  function removeDraftRow(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function saveDraft() {
    const installments: ScheduleInstallmentInput[] = draft
      .filter((r) => r.label.trim() && r.dueDate)
      .map((r) => ({
        label: r.label,
        amount: Number(r.amount) || 0,
        percentage: r.percentage.trim() === "" ? null : Number(r.percentage),
        dueDate: r.dueDate,
      }));
    if (installments.length === 0) {
      setError("Add at least one milestone with a label and due date");
      return;
    }
    run(async () => {
      await createSchedule(invoiceId, installments);
      setBuilding(false);
      setDraft([]);
    });
  }

  function copyReminder(item: ScheduleRow) {
    const amount = formatCurrency(item.amount_cents / 100, currency);
    const message = `Hi, this is a friendly reminder that the "${item.label}" payment of ${amount} is due on ${formatDate(item.due_date)}. Please let us know once payment has been made. Thank you.`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(message).then(
        () => {
          setReminderCopied(item.id);
          setTimeout(() => setReminderCopied(null), 2500);
        },
        () => setError("Could not copy reminder to clipboard")
      );
    }
  }

  const draftTotal = draft.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-surface-900">Payment Schedule</h3>
          {schedule.length > 0 && (
            <p className="text-xs text-surface-500 mt-0.5">
              {paidCount} of {schedule.length} payments made —{" "}
              {formatCurrency(paidCents / 100, currency)} of{" "}
              {formatCurrency(scheduledCents / 100, currency)} ({progressPct}%)
            </p>
          )}
        </div>
        {schedule.length > 0 && !building && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (confirm("Delete the entire payment schedule? This cannot be undone.")) {
                run(async () => {
                  await deleteSchedule(invoiceId);
                });
              }
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white text-surface-600 text-xs font-medium hover:bg-surface-50 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear schedule
          </button>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      )}

      {/* Builder mode */}
      {building ? (
        <div className="p-6 space-y-4">
          <p className="text-xs text-surface-500">
            Adjust the milestones below, then save. Amounts are in {currency}.
          </p>
          <div className="space-y-3">
            {draft.map((row, index) => (
              <div
                key={index}
                className="grid grid-cols-1 sm:grid-cols-[1fr_120px_90px_150px_40px] gap-2 items-end"
              >
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">Label</label>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateDraftRow(index, { label: e.target.value })}
                    placeholder="e.g. Deposit"
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">Amount (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.amount}
                    onChange={(e) => updateDraftRow(index, { amount: e.target.value })}
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">%</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={row.percentage}
                    onChange={(e) => updateDraftRow(index, { percentage: e.target.value })}
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-500 mb-1">Due date</label>
                  <input
                    type="date"
                    value={row.dueDate}
                    onChange={(e) => updateDraftRow(index, { dueDate: e.target.value })}
                    className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeDraftRow(index)}
                  aria-label="Remove milestone"
                  className="h-[38px] inline-flex items-center justify-center rounded-lg border border-surface-200 text-surface-400 hover:text-danger-600 hover:border-danger-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addDraftRow}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="w-4 h-4" />
            Add milestone
          </button>

          <div className="flex items-center justify-between border-t border-surface-100 pt-4">
            <div className="text-sm text-surface-600">
              Schedule total:{" "}
              <span className="font-semibold text-surface-900 tabular-nums">
                {formatCurrency(draftTotal, currency)}
              </span>
              {Math.abs(draftTotal - totalMajor) > 0.01 && (
                <span className="ml-2 text-xs text-warning-600">
                  (invoice total is {formatCurrency(totalMajor, currency)})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBuilding(false);
                  setDraft([]);
                  setError(null);
                }}
                className="px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={saveDraft}
                className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save schedule"}
              </button>
            </div>
          </div>
        </div>
      ) : schedule.length === 0 ? (
        /* No schedule yet — preset templates */
        <div className="p-6">
          <EmptyState
            title="No payment schedule"
            description="Split this invoice into deposit, interim and balance payments to track milestones."
            compact
          />
          <div className="mt-4">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2">
              Set up a schedule
            </p>
            <div className="flex flex-wrap gap-2">
              <PresetButton label="33% / 33% / 34%" onClick={() => startBuilder(presetThirds())} />
              <PresetButton label="50% now / 50% balance" onClick={() => startBuilder(presetHalves())} />
              <PresetButton label="100% upfront" onClick={() => startBuilder(presetUpfront())} />
              <PresetButton label="Split into 4" onClick={() => startBuilder(presetSplitN(4))} />
              <PresetButton
                label="Custom"
                icon={<Wand2 className="w-3.5 h-3.5" />}
                onClick={() =>
                  startBuilder([
                    { label: "", amount: "", percentage: "", dueDate: todayISO() },
                  ])
                }
              />
            </div>
          </div>
        </div>
      ) : (
        /* Existing schedule */
        <div>
          {/* Progress + next due summary */}
          <div className="px-6 py-4 border-b border-surface-100">
            <div className="w-full bg-surface-100 rounded-full h-2.5 overflow-hidden flex">
              <div
                className="h-2.5 bg-success-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-surface-500">
              <span>{formatCurrency(paidCents / 100, currency)} received</span>
              {overdueCount > 0 && (
                <span className="text-danger-600 font-medium">{overdueCount} overdue</span>
              )}
              {nextDue && (
                <span>
                  Next: {formatCurrency(nextDue.amount_cents / 100, currency)} due{" "}
                  {formatDate(nextDue.due_date)}
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">#</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Label</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Due date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {schedule.map((item, index) => (
                  <tr key={item.id} className="hover:bg-surface-50">
                    <td className="px-6 py-3 text-surface-400 tabular-nums">{index + 1}</td>
                    <td className="px-6 py-3 text-surface-900 font-medium">
                      {item.label}
                      {item.percentage != null && (
                        <span className="ml-1.5 text-xs text-surface-400">({item.percentage}%)</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-medium text-surface-900">
                      {formatCurrency(item.amount_cents / 100, currency)}
                    </td>
                    <td className="px-6 py-3 text-surface-600">{formatDate(item.due_date)}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={item.effectiveStatus} />
                      {item.status === "paid" && item.paid_at && (
                        <span className="ml-2 text-xs text-surface-400">{formatDate(item.paid_at)}</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === "paid" ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              run(async () => {
                                await markScheduleItemPaid(invoiceId, item.id, false);
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-surface-500 hover:bg-surface-100 transition-colors disabled:opacity-50"
                          >
                            Undo
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                run(async () => {
                                  await markScheduleItemPaid(invoiceId, item.id, true);
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-success-700 bg-success-50 hover:bg-success-100 transition-colors disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Mark paid
                            </button>
                            <button
                              type="button"
                              onClick={() => copyReminder(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-surface-600 hover:bg-surface-100 transition-colors"
                            >
                              <Send className="w-3.5 h-3.5" />
                              {reminderCopied === item.id ? "Copied" : "Reminder"}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={isPending}
                          aria-label="Delete milestone"
                          onClick={() =>
                            run(async () => {
                              await deleteScheduleItem(invoiceId, item.id);
                            })
                          }
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-surface-100">
            <button
              type="button"
              onClick={() =>
                startBuilder([
                  ...schedule.map((s) => ({
                    label: s.label,
                    amount: (s.amount_cents / 100).toFixed(2),
                    percentage: s.percentage != null ? String(s.percentage) : "",
                    dueDate: s.due_date,
                  })),
                  { label: "", amount: "", percentage: "", dueDate: addDaysISO(baseDate, 0) },
                ])
              }
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Calendar className="w-4 h-4" />
              Rebuild schedule
            </button>
            <p className="mt-1 text-xs text-surface-400">
              Rebuilding replaces the current schedule with the milestones you save.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 hover:border-brand-200 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
