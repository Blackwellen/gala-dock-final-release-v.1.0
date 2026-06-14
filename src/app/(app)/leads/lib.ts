import { formatCurrency } from "@/lib/utils";

export const LEAD_STAGES = [
  "new-enquiry",
  "contacted",
  "proposal-sent",
  "negotiating",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SOURCES = [
  "website",
  "referral",
  "instagram",
  "facebook",
  "email",
  "phone",
  "walk-in",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const EVENT_TYPES = [
  "Wedding",
  "Corporate",
  "Charity",
  "Private",
  "Conference",
  "Exhibition",
  "Other",
] as const;

export const STAGE_LABELS: Record<LeadStage, string> = {
  "new-enquiry": "New Enquiry",
  contacted: "Contacted",
  "proposal-sent": "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

/** Kanban column accent dots, aligned with the StatusBadge palette. */
export const STAGE_COLORS: Record<LeadStage, string> = {
  "new-enquiry": "bg-info-500",
  contacted: "bg-info-500",
  "proposal-sent": "bg-violet-500",
  negotiating: "bg-warning-500",
  won: "bg-success-500",
  lost: "bg-surface-400",
};

export const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  phone: "Phone",
  "walk-in": "Walk-in",
  other: "Other",
};

export function formatBudget(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return formatCurrency(cents / 100);
}

export function formatEventDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function sourceLabel(source: string | null): string {
  if (!source) return "—";
  return SOURCE_LABELS[source] ?? source;
}
