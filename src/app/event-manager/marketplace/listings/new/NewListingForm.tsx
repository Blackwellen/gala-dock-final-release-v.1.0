"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { createListing } from "../actions";
import { MARKETPLACE_CATEGORIES, PRICE_UNITS } from "../../categories";

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

/** True for Next.js redirect/notFound control-flow errors, which must re-throw. */
function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

export function NewListingForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createListing(formData);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-5">
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1.5">
          Title <span className="text-danger-500">*</span>
        </label>
        <input name="title" required placeholder="e.g. The Big Top Bouncy Castle" className={inputCls} />
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1.5">
          Category <span className="text-danger-500">*</span>
        </label>
        <select name="category" required className={inputCls}>
          {MARKETPLACE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1.5">Description</label>
        <textarea
          name="description"
          rows={4}
          placeholder="What buyers should know before booking you."
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Price from (£)</label>
          <input name="priceFrom" type="number" min="0" step="0.01" placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Price unit</label>
          <select name="priceUnit" className={inputCls}>
            {PRICE_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-600 mb-1.5">Coverage areas</label>
        <input name="coverageRegions" placeholder="e.g. London, Surrey, Kent (comma separated)" className={inputCls} />
      </div>

      <p className="text-xs text-surface-400">
        New listings save as a draft — publish from the listing page once you&apos;re happy with it.
      </p>

      <div className="flex items-center justify-between pt-2 border-t border-surface-100">
        <Link
          href="/event-manager/marketplace/listings"
          className="inline-flex items-center gap-1.5 text-sm text-surface-600 hover:text-surface-900"
        >
          <X className="w-4 h-4" />
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 py-2.5 px-6 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating…" : "Create listing"}
        </button>
      </div>
    </form>
  );
}
