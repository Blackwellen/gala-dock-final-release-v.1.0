"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { submitQuoteRequest } from "@/lib/marketplace/actions";

const inputCls =
  "w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500";

/** True for Next.js redirect/notFound control-flow errors, which must re-throw. */
function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

export function RequestQuoteForm({
  listingId,
  supplierName,
  responseTime,
}: {
  listingId: string;
  supplierName: string;
  responseTime: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const [eventDate, setEventDate] = useState("");
  const [requirements, setRequirements] = useState("");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitQuoteRequest({
          listingId,
          eventDate: eventDate || undefined,
          requirements: requirements || undefined,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setSent(true);
      } catch (e) {
        if (isControlFlowError(e)) throw e;
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-success-200 bg-success-50 p-5 shadow-card">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-success-700">
          <CheckCircle2 className="w-4 h-4" /> Quote request sent
        </p>
        <p className="mt-1.5 text-sm text-success-700">
          {supplierName} typically responds within {responseTime}.
        </p>
        <Link
          href="/event-manager/marketplace"
          className="mt-3 inline-flex items-center text-sm font-medium text-success-700 hover:text-success-800 underline underline-offset-2"
        >
          Back to marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
      <h3 className="text-sm font-semibold text-surface-900">Your event details</h3>
      <div className="mt-3 space-y-3">
        {error && (
          <div className="px-3 py-2 bg-danger-50 border border-danger-200 rounded-lg text-xs text-danger-700">
            {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-surface-500 mb-1">Event date</label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-500 mb-1">Requirements</label>
          <textarea
            placeholder={`Tell ${supplierName} about your event, guest count, and what you need…`}
            rows={5}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Sending…" : "Send Quote Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
