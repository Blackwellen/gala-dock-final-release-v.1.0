"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { updateListing, setListingStatus, deleteListing } from "../../actions";
import { MARKETPLACE_CATEGORIES, PRICE_UNITS } from "../../../categories";
import type { Database } from "@/lib/supabase/database.types";

type Listing = Database["public"]["Tables"]["marketplace_listings"]["Row"];

const inputCls =
  "w-full px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

export function EditListingForm({ listing }: { listing: Listing }) {
  const [pending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateListing(listing.id, formData);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function handleStatusChange(status: "draft" | "live" | "paused") {
    startStatusTransition(async () => {
      try {
        await setListingStatus(listing.id, status);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${listing.title}"? This can't be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteListing(listing.id);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-medium text-surface-500 mb-1">Visibility</p>
          <p className="text-sm text-surface-700">
            {listing.status === "live"
              ? "Live — visible to buyers in the marketplace."
              : listing.status === "paused"
                ? "Paused — hidden from the marketplace until resumed."
                : "Draft — not visible until you publish."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {listing.status !== "live" && (
            <button
              type="button"
              disabled={statusPending}
              onClick={() => handleStatusChange("live")}
              className="px-4 py-2 rounded-lg bg-success-600 text-white text-sm font-medium hover:bg-success-700 disabled:opacity-50 transition-colors"
            >
              Publish
            </button>
          )}
          {listing.status === "live" && (
            <button
              type="button"
              disabled={statusPending}
              onClick={() => handleStatusChange("paused")}
              className="px-4 py-2 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:bg-surface-50 disabled:opacity-50 transition-colors"
            >
              Pause
            </button>
          )}
        </div>
      </div>

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
          <input name="title" required defaultValue={listing.title} className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">
            Category <span className="text-danger-500">*</span>
          </label>
          <select name="category" required defaultValue={listing.category} className={inputCls}>
            {MARKETPLACE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1.5">Description</label>
          <textarea name="description" rows={4} defaultValue={listing.description ?? ""} className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Price from (£)</label>
            <input
              name="priceFrom"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(listing.price_from_cents / 100).toFixed(2)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">Price unit</label>
            <select name="priceUnit" defaultValue={listing.price_unit} className={inputCls}>
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
          <input
            name="coverageRegions"
            defaultValue={listing.coverage_regions.join(", ")}
            placeholder="e.g. London, Surrey, Kent (comma separated)"
            className={inputCls}
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-surface-100">
          <Link
            href="/event-manager/marketplace/listings"
            className="inline-flex items-center gap-1.5 text-sm text-surface-600 hover:text-surface-900"
          >
            <X className="w-4 h-4" />
            Back to listings
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 py-2.5 px-6 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <button
        type="button"
        disabled={pending}
        onClick={handleDelete}
        className="inline-flex items-center gap-1.5 text-sm text-danger-600 hover:text-danger-700 disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete listing
      </button>
    </div>
  );
}
