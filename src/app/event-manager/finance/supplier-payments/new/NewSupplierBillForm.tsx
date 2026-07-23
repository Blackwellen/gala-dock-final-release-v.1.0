"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplierBill } from "../actions";

interface Option {
  id: string;
  name: string;
}

const CATEGORIES = ["AV", "Catering", "Security", "Venue Hire", "Decor", "Staffing", "Transport", "Miscellaneous"];

export function NewSupplierBillForm({ suppliers, events }: { suppliers: Option[]; events: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    if (!formData.get("supplier_id")) {
      setError("Select a supplier.");
      return;
    }
    if (!formData.get("event_id")) {
      setError("Select an event.");
      return;
    }
    startTransition(async () => {
      try {
        await createSupplierBill(formData);
        router.push("/event-manager/finance/supplier-payments");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create supplier bill.");
      }
    });
  }

  return (
    <form action={submit} className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
      {error && (
        <div className="px-3 py-2 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-surface-600">Supplier</span>
          <select name="supplier_id" defaultValue={suppliers[0]?.id ?? ""} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
            {suppliers.length === 0 && <option value="">No suppliers found</option>}
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-surface-600">Linked Event</span>
          <select name="event_id" defaultValue={events[0]?.id ?? ""} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
            {events.length === 0 && <option value="">No events found</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-surface-600">Description</span>
        <input name="description" required maxLength={500} placeholder="e.g. AV rig + LED wall hire" className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-surface-600">Category</span>
          <select name="category" defaultValue={CATEGORIES[0]} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-surface-600">Bill Number</span>
          <input name="bill_number" placeholder="BILL-2026-0001" className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-surface-600">Amount (£)</span>
          <input name="amount" type="number" min="0" step="0.01" required placeholder="0.00" className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-surface-600">Issue Date</span>
          <input name="expense_date" type="date" className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-surface-600">Due Date</span>
          <input name="due_date" type="date" className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
        </label>
      </div>

      <input type="hidden" name="currency" value="GBP" />

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg border border-surface-200 text-sm font-medium text-surface-700 hover:bg-surface-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || suppliers.length === 0 || events.length === 0}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Add Supplier Bill"}
        </button>
      </div>
    </form>
  );
}
