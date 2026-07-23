"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitVenueEnquiry } from "@/lib/marketplace/actions";

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

export function VenueEnquiryForm({
  listingId,
  venueName,
  responseTime,
}: {
  listingId: string;
  venueName: string;
  responseTime: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("Conference");
  const [guestCount, setGuestCount] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitVenueEnquiry({
          listingId,
          eventDate: eventDate || undefined,
          eventType,
          guestCount: guestCount ? Number(guestCount) : undefined,
          message,
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
          <CheckCircle2 className="w-4 h-4" /> Enquiry sent
        </p>
        <p className="mt-1.5 text-sm text-success-700">
          {venueName} typically responds within {responseTime}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-card">
      <h3 className="text-sm font-semibold text-surface-900">Enquire with this venue</h3>
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
          <label className="block text-xs font-medium text-surface-500 mb-1">Event type</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputCls}>
            <option>Conference</option>
            <option>Gala Dinner</option>
            <option>Product Launch</option>
            <option>Wedding</option>
            <option>Private Party</option>
            <option>Awards Ceremony</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-500 mb-1">Guests</label>
          <input
            type="number"
            placeholder="Number of guests"
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-500 mb-1">Message</label>
          <textarea
            placeholder="Tell the venue about your event…"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? "Sending…" : "Send Enquiry"}
          </button>
          {/* Holds require a marketplace_hold_requests table, which doesn't exist yet (later
              phase) — this stays a static, non-functional secondary action for now. */}
          <button
            type="button"
            className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-surface-200 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
          >
            Request Hold
          </button>
        </div>
      </div>
    </div>
  );
}
