"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createDeposit } from "./actions";

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "client_deposit", label: "Client Deposit" },
  { value: "venue_hire", label: "Venue Retainer" },
  { value: "bar", label: "Bar Deposit" },
  { value: "security", label: "Security Hold" },
  { value: "final_balance", label: "Final Balance Milestone" },
  { value: "ticketing_reserve", label: "Ticketing Reserve" },
  { value: "damage", label: "Damage Deposit" },
  { value: "other", label: "Other Deposit" },
];

interface DepositFormProps {
  events: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}

export function DepositForm({ events, clients }: DepositFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    eventId: events[0]?.id ?? "",
    clientId: "",
    kind: "client_deposit",
    label: "",
    amount: "" as string,
    currency: "GBP",
    dueDate: "",
    refundable: true,
    notes: "",
  });

  function submit() {
    setError(null);
    if (!form.eventId) {
      setError("Select an event for this deposit.");
      return;
    }
    if (!form.label.trim()) {
      setError("Give this deposit a label, e.g. \"Venue retainer\".");
      return;
    }
    const amountMajor = Number(form.amount);
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      setError("Enter a total required amount greater than zero.");
      return;
    }
    startTransition(async () => {
      try {
        await createDeposit({
          eventId: form.eventId,
          clientId: form.clientId,
          kind: form.kind,
          label: form.label,
          amountMajor,
          currency: form.currency,
          dueDate: form.dueDate,
          refundable: form.refundable,
          notes: form.notes,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create deposit");
      }
    });
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <div className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-surface-900">New Deposit</h1>
            <p className="text-xs text-surface-400 mt-0.5">Track a client retainer, venue hire deposit or balance milestone</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-2xl space-y-6">
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {error}
          </div>
        )}

        {events.length === 0 ? (
          <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
            You need at least one event before you can create a deposit. Create an event first, then come back here.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-surface-900 mb-1">Deposit Details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Event</label>
                <select
                  value={form.eventId}
                  onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Client (optional)</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="">No linked client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Deposit Type</label>
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="GBP">GBP — British Pound</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Label</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Venue retainer — main hall"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Total Required</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <input
                  id="refundable"
                  type="checkbox"
                  checked={form.refundable}
                  onChange={(e) => setForm({ ...form, refundable: e.target.checked })}
                  className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="refundable" className="text-sm text-surface-700">This deposit is refundable</label>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Payment terms or internal notes…"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || events.length === 0}
            className="px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create Deposit"}
          </button>
          <button
            onClick={() => router.back()}
            className="px-6 py-2.5 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
