"use client";

import { useRef, useState, useTransition } from "react";
import { createVenueHold } from "../../actions";

const HOLD_TYPES = [
  { value: "first_option", label: "First Option" },
  { value: "second_option", label: "Second Option" },
  { value: "provisional", label: "Provisional" },
  { value: "confirmed", label: "Confirmed" },
];

export function AddHoldForm({ venueId }: { venueId: string }) {
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
            await createVenueHold(venueId, formData);
            formRef.current?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create hold");
          }
        });
      }}
      className="space-y-2.5"
    >
      <select name="hold_type" required className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" defaultValue="first_option">
        {HOLD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <input name="start_at" type="date" required className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="end_at" type="date" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="expiry_date" type="date" placeholder="Expiry date" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="notes" placeholder="Notes (optional)" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      {error && <p className="text-xs text-danger-600">{error}</p>}
      <button type="submit" disabled={isPending} className="w-full py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
        {isPending ? "Saving…" : "Create Hold"}
      </button>
    </form>
  );
}
