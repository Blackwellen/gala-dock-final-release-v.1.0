"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Users2, ArrowLeft, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { createRfq } from "../actions";

export interface SupplierOption {
  id: string;
  name: string;
  category: string | null;
}

export interface EventOption {
  id: string;
  name: string;
}

interface CriterionRow {
  key: number;
  criterion: string;
  weight: string;
}

export function NewRfqForm({
  suppliers,
  events,
}: {
  suppliers: SupplierOption[];
  events: EventOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [criteria, setCriteria] = useState<CriterionRow[]>([]);
  const criterionKeyRef = useRef(0);

  const categoryOptions = useMemo(
    () => [...new Set(suppliers.map((s) => s.category).filter((c): c is string => !!c))].sort(),
    [suppliers]
  );

  function addCriterion() {
    const key = criterionKeyRef.current++;
    setCriteria((prev) => [...prev, { key, criterion: "", weight: "" }]);
  }

  function updateCriterion(key: number, field: "criterion" | "weight", value: string) {
    setCriteria((prev) => prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  }

  function removeCriterion(key: number) {
    setCriteria((prev) => prev.filter((c) => c.key !== key));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q)
    );
  }, [suppliers, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const labelCls = "block text-sm font-medium text-surface-700 mb-1.5";
  const inputCls =
    "w-full px-3 py-2 text-sm text-surface-900 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-surface-400";

  const defaultDue = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="New RFQ"
        description="Request a quote from one or more suppliers"
        actions={
          <Link
            href="/event-manager/rfqs"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
            Cancel
          </Link>
        }
      />

      <form action={createRfq} className="p-6 max-w-3xl space-y-6">
        {/* Brief */}
        <section className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-surface-900">Brief</h2>
          <div>
            <label className={labelCls} htmlFor="title">
              RFQ Title <span className="text-danger-500">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. Catering for Carter Wedding"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="scope">
              Scope / Brief
            </label>
            <textarea
              id="scope"
              name="scope"
              rows={4}
              placeholder="Describe exactly what's needed: services, headcount, timings, style…"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="event_id">
                Link to Event
              </label>
              <select id="event_id" name="event_id" className={inputCls} defaultValue="">
                <option value="">No linked event</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="due_date">
                Response Deadline
              </label>
              <input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={defaultDue}
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls} htmlFor="category">
                Category
              </label>
              <input
                id="category"
                name="category"
                type="text"
                list="rfq-category-options"
                placeholder="e.g. Catering"
                className={inputCls}
              />
              <datalist id="rfq-category-options">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls} htmlFor="budget_low">
                Budget Low (£)
              </label>
              <input
                id="budget_low"
                name="budget_low"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="budget_high">
                Budget High (£)
              </label>
              <input
                id="budget_high"
                name="budget_high"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className={inputCls}
              />
            </div>
          </div>
        </section>

        {/* Evaluation criteria (optional) */}
        <section className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-surface-900">Evaluation Criteria</h2>
              <p className="text-xs text-surface-400 mt-0.5">
                Optional — how you&apos;ll weigh responses when comparing quotes.
              </p>
            </div>
            <button
              type="button"
              onClick={addCriterion}
              className="px-3 py-1.5 text-xs font-semibold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
            >
              + Add Criterion
            </button>
          </div>
          {criteria.length > 0 && (
            <div className="space-y-2">
              {criteria.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <input
                    type="text"
                    name="criterion"
                    value={c.criterion}
                    onChange={(e) => updateCriterion(c.key, "criterion", e.target.value)}
                    placeholder="e.g. Price"
                    className={inputCls + " flex-1"}
                  />
                  <input
                    type="number"
                    name="weight"
                    min={0}
                    max={100}
                    value={c.weight}
                    onChange={(e) => updateCriterion(c.key, "weight", e.target.value)}
                    placeholder="Weight %"
                    className={inputCls + " w-28"}
                  />
                  <button
                    type="button"
                    onClick={() => removeCriterion(c.key)}
                    aria-label="Remove criterion"
                    className="p-2 text-surface-400 hover:text-danger-600 rounded-md hover:bg-danger-50 transition-colors"
                  >
                    <X className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Suppliers */}
        <section className="bg-white rounded-xl border border-surface-200 shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-surface-900">
              Select Suppliers <span className="text-danger-500">*</span>
            </h2>
            <span className="text-xs text-surface-500">{selected.size} selected</span>
          </div>

          {suppliers.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No suppliers yet"
              description="Add suppliers to your workspace before requesting quotes."
              compact
            />
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white">
                <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search suppliers…"
                  className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
                />
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-surface-100 border border-surface-100 rounded-lg">
                {filtered.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        name="supplier_ids"
                        value={s.id}
                        checked={checked}
                        onChange={() => toggle(s.id)}
                        className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-surface-900 truncate">
                          {s.name}
                        </span>
                        {s.category && (
                          <span className="block text-xs text-surface-400">{s.category}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-sm text-surface-400">No suppliers match your search.</p>
                )}
              </div>
            </>
          )}
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={selected.size === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-brand"
          >
            Send RFQ
          </button>
          <Link
            href="/event-manager/rfqs"
            className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
