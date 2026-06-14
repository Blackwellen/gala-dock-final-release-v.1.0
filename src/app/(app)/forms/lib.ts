import type { FormType, FormStatus, FieldType } from "@/lib/supabase/types";

export const FORM_TYPES = [
  "enquiry",
  "rsvp",
  "feedback",
  "supplier-info",
  "custom",
] as const;

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  enquiry: "Enquiry",
  rsvp: "RSVP",
  feedback: "Feedback",
  "supplier-info": "Supplier Info",
  custom: "Custom",
};

export const FIELD_TYPES = [
  "short-text",
  "long-text",
  "select",
  "multi-select",
  "date",
  "number",
  "file-upload",
  "section-header",
] as const;

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  "short-text": "Short Text",
  "long-text": "Long Text",
  select: "Dropdown",
  "multi-select": "Multi-Select",
  date: "Date",
  number: "Number",
  "file-upload": "File Upload",
  "section-header": "Section Header",
};

/** Field types that capture a value (everything except the visual divider). */
export function isInputField(type: FieldType): boolean {
  return type !== "section-header";
}

/** Field types that require an options list. */
export function needsOptions(type: FieldType): boolean {
  return type === "select" || type === "multi-select";
}

export function coerceFormType(raw: string | null | undefined): FormType {
  const v = String(raw ?? "custom");
  return (FORM_TYPES as readonly string[]).includes(v) ? (v as FormType) : "custom";
}

export function coerceFormStatus(raw: string | null | undefined): FormStatus {
  const v = String(raw ?? "draft");
  return v === "published" || v === "archived" || v === "draft"
    ? (v as FormStatus)
    : "draft";
}

export function coerceFieldType(raw: string | null | undefined): FieldType {
  const v = String(raw ?? "short-text");
  return (FIELD_TYPES as readonly string[]).includes(v)
    ? (v as FieldType)
    : "short-text";
}

export function formatDateTime(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateShort(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Normalise the jsonb options column (string[] expected) into a clean string[]. */
export function normaliseOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => String(o)).filter((o) => o.trim() !== "");
}
