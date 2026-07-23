"use client";

import { useRef, useState, useTransition } from "react";
import { addVenueNote } from "../../actions";

const NOTE_TYPES = [
  { value: "general", label: "General Note" },
  { value: "site_visit", label: "Site Visit" },
  { value: "call_summary", label: "Call Summary" },
  { value: "commercial", label: "Commercial" },
  { value: "logistics", label: "Logistics" },
  { value: "technical", label: "Technical" },
  { value: "accessibility", label: "Accessibility" },
  { value: "client_feedback", label: "Client Feedback" },
];

export function NoteForm({ venueId }: { venueId: string }) {
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
            await addVenueNote(venueId, formData);
            formRef.current?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add note");
          }
        });
      }}
      className="space-y-2.5"
    >
      <select
        name="note_type"
        className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        defaultValue="general"
      >
        {NOTE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <textarea
        name="body"
        required
        rows={4}
        placeholder="Write a note…"
        className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
      />
      <label className="flex items-center gap-2 text-xs text-surface-500">
        <input type="checkbox" name="is_pinned" className="rounded border-surface-300" />
        Pin this note
      </label>
      {error && <p className="text-xs text-danger-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add Note"}
      </button>
    </form>
  );
}
