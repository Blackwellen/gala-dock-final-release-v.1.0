"use client";

import { useRef, useState, useTransition } from "react";
import { createVenueRoomBlock } from "../../actions";

export function AddRoomBlockForm({ venueId }: { venueId: string }) {
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
            await createVenueRoomBlock(venueId, formData);
            formRef.current?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create room block");
          }
        });
      }}
      className="space-y-2.5"
    >
      <input name="room_type" placeholder="Room type" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="num_rooms" type="number" min="1" required placeholder="Number of rooms" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="nightly_rate" type="number" step="0.01" placeholder="Nightly rate (£)" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="start_date" type="date" required className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="end_date" type="date" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="release_date" type="date" placeholder="Release date" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      <input name="notes" placeholder="Notes (optional)" className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2" />
      {error && <p className="text-xs text-danger-600">{error}</p>}
      <button type="submit" disabled={isPending} className="w-full py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50">
        {isPending ? "Saving…" : "Create Room Block"}
      </button>
    </form>
  );
}
