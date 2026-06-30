/** Shared labels + formatting for the Team & Staffing module. */

export const BLOCK_TYPES = [
  "holiday",
  "sick",
  "training",
  "personal",
  "external-event",
  "other",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_TYPE_LABELS: Record<string, string> = {
  holiday: "Holiday",
  sick: "Sick Leave",
  training: "Training",
  personal: "Personal",
  "external-event": "External Event",
  other: "Other",
};

export function blockTypeLabel(raw: string | null): string {
  if (!raw) return "Unavailable";
  return BLOCK_TYPE_LABELS[raw] ?? raw;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return DATE_FMT.format(d);
}

/** Format a block as a date range, collapsing single-day blocks. */
export function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return DATE_FMT.format(start);
  return `${DATE_FMT.format(start)} – ${DATE_FMT.format(end)}`;
}

export type LoadLevel = "light" | "moderate" | "heavy";

/** Workload classification based on number of assigned active events. */
export function loadLevel(eventCount: number): LoadLevel {
  if (eventCount >= 6) return "heavy";
  if (eventCount >= 3) return "moderate";
  return "light";
}

export const LOAD_STYLES: Record<LoadLevel, { label: string; classes: string }> = {
  light: { label: "Light", classes: "bg-success-50 text-success-700 border-success-200" },
  moderate: { label: "Moderate", classes: "bg-warning-50 text-warning-600 border-warning-200" },
  heavy: { label: "Heavy", classes: "bg-danger-50 text-danger-600 border-danger-200" },
};
