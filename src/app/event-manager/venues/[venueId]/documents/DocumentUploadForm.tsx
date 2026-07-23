"use client";

import { useRef, useState, useTransition } from "react";
import { uploadVenueDocument } from "../../actions";

const DOC_TYPES = [
  { value: "hire-agreement", label: "Hire Agreement / Contract" },
  { value: "floorplan", label: "Floor Plan" },
  { value: "health-safety", label: "Health & Safety" },
  { value: "insurance", label: "Insurance" },
  { value: "capacity-certificate", label: "Capacity Certificate" },
  { value: "site-map", label: "Site Map" },
  { value: "other", label: "Other" },
];

export function DocumentUploadForm({ venueId }: { venueId: string }) {
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
            await uploadVenueDocument(venueId, formData);
            formRef.current?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
          }
        });
      }}
      className="space-y-3"
    >
      <select
        name="doc_type"
        required
        className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {DOC_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <input
        type="date"
        name="expiry_date"
        placeholder="Expiry date (optional)"
        className="w-full text-sm rounded-lg border border-surface-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <input
        type="file"
        name="file"
        required
        className="w-full text-xs text-surface-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-xs file:font-medium"
      />
      {error && <p className="text-xs text-danger-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {isPending ? "Uploading…" : "Upload Document"}
      </button>
      <p className="text-[11px] text-surface-400">Max file size 100MB per file</p>
    </form>
  );
}
