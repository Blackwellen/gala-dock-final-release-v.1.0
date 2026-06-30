"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2 } from "lucide-react";
import { createQuote } from "./actions";

interface LineItem {
  id: number;
  description: string;
  qty: number;
  unitPrice: number;
  taxPct: number;
}

interface SupplierOption {
  id: string;
  name: string;
}

let nextId = 2;

export function QuoteForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    supplier: suppliers[0]?.id ?? "",
    title: "",
    currency: "GBP",
    deadline: "",
    scope: "",
    notes: "",
  });

  const [lines, setLines] = useState<LineItem[]>([
    { id: 1, description: "", qty: 1, unitPrice: 0, taxPct: 20 },
  ]);

  function addLine() {
    setLines((prev) => [...prev, { id: nextId++, description: "", qty: 1, unitPrice: 0, taxPct: 20 }]);
  }
  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }
  function updateLine(id: number, field: keyof LineItem, value: string | number) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const taxTotal = lines.reduce((s, l) => s + (l.qty * l.unitPrice * l.taxPct) / 100, 0);
  const total = subtotal + taxTotal;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: form.currency || "GBP" }).format(n);

  function submit() {
    setError(null);
    if (!form.supplier) {
      setError("Please select a supplier.");
      return;
    }
    startTransition(async () => {
      try {
        await createQuote({
          supplierId: form.supplier,
          title: form.title,
          currency: form.currency,
          deadline: form.deadline,
          scope: form.scope,
          notes: form.notes,
          lines: lines.map((l) => ({
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxPct: l.taxPct,
          })),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create quote");
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
          <h1 className="text-lg font-semibold text-surface-900">New Quote</h1>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-4xl space-y-6">
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Quote Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Supplier</label>
              <select
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                {suppliers.length === 0 && <option value="">No suppliers available</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Catering — Carter Wedding"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
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
            <div>
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Deadline</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-surface-700 mb-1.5">Scope</label>
              <textarea
                rows={3}
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                placeholder="Describe what this quote covers…"
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
            <h2 className="text-sm font-semibold text-surface-900">Line Items</h2>
            <button onClick={addLine} className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium">
              <Plus className="w-3.5 h-3.5" />
              Add Line
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider min-w-[240px]">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-20">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-32">Unit Price</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-24">Tax %</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider w-32">Line Total</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-surface-50/50">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(line.id, "description", e.target.value)}
                        placeholder="e.g. Catering — Wedding Breakfast"
                        className="w-full px-2 py-1.5 rounded-md border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => updateLine(line.id, "qty", Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded-md border border-surface-200 text-sm text-surface-900 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.id, "unitPrice", Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded-md border border-surface-200 text-sm text-surface-900 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={line.taxPct}
                        onChange={(e) => updateLine(line.id, "taxPct", Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded-md border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                      >
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={20}>20%</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-surface-900">{fmt(line.qty * line.unitPrice)}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => removeLine(line.id)}
                        className="p-1 rounded hover:bg-danger-50 text-surface-300 hover:text-danger-600 transition-colors"
                        disabled={lines.length === 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-50 border-t border-surface-200">
                <tr>
                  <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Subtotal</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-surface-900">{fmt(subtotal)}</td>
                  <td />
                </tr>
                <tr className="border-t border-surface-100">
                  <td colSpan={4} className="px-6 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Tax</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-surface-900">{fmt(taxTotal)}</td>
                  <td />
                </tr>
                <tr className="border-t-2 border-surface-200">
                  <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-surface-900">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-base font-bold text-surface-900">{fmt(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <label className="block text-xs font-semibold text-surface-700 uppercase tracking-wider mb-2">Notes</label>
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Any additional notes for the supplier…"
            className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || suppliers.length === 0}
            className="px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create Quote"}
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
