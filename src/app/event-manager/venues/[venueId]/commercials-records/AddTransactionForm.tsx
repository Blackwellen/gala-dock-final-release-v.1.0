"use client";

import { useRef, useState, useTransition } from "react";
import { addVenueCommercialTransaction } from "../../actions";

const TYPES = [
  { value: "venue_deposit", label: "Venue Deposit" },
  { value: "security_deposit", label: "Security Deposit" },
  { value: "bar_deposit", label: "Bar Deposit" },
  { value: "fb_deposit", label: "F&B Deposit" },
  { value: "hold_fee", label: "Hold Fee" },
  { value: "cancellation_fee", label: "Cancellation Fee" },
  { value: "rate_review", label: "Rate Review" },
];

export function AddTransactionForm({ venueId }: { venueId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await addVenueCommercialTransaction(venueId, formData);
            formRef.current?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add transaction");
          }
        });
      }}
      className="space-y-2.5"
    >
      <select name="transaction_type" required className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2">
        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <input name="amount" type="number" step="0.01" required placeholder="Amount (£)" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="due_date" type="date" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <select name="paid_status" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" defaultValue="open">
        <option value="open">Open</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
      </select>
      <input name="notes" placeholder="Notes (optional)" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      {error && <p className="text-xs text-danger-600">{error}</p>}
      <button type="submit" disabled={isPending} className="w-full py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
        {isPending ? "Saving…" : "Add Transaction"}
      </button>
    </form>
  );
}
