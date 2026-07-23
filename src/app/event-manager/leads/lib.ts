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

// ───────────────────────── Wizard catalogues ─────────────────────────

export const CONTACT_METHODS = ["email", "phone", "either", "whatsapp"] as const;
export const CONTACT_METHOD_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  either: "Either",
  whatsapp: "WhatsApp",
};

export const EVENT_FORMATS = ["in-person", "remote", "hybrid"] as const;
export const EVENT_FORMAT_LABELS: Record<string, string> = {
  "in-person": "In-person",
  remote: "Remote",
  hybrid: "Hybrid",
};

export const DATE_FLEXIBILITY_OPTIONS = ["Exact date", "± 1 week", "± 2 weeks", "± 1 month", "Flexible"];

export const TICKETING_TYPES = ["Ticketed", "Private (Invite Only)", "Public", "Unlisted"];

export const VENUE_TYPE_OPTIONS = [
  "Hotel",
  "Marquee",
  "Country House",
  "Exhibition Centre",
  "Convention Centre",
  "Nightclub",
  "Restaurant",
  "Rooftop",
  "Warehouse",
  "Theatre",
  "Stadium",
  "Outdoor / Garden",
  "Virtual Studio",
];

export const PRIORITY_LEVELS = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITY_LEVELS)[number];

export const FOLLOW_UP_CADENCES = ["Daily", "Every 2 days", "Every 3 days", "Weekly", "Fortnightly"];

export const LEAD_TEMPERATURES = ["cold", "warm", "hot"] as const;

/** Qualification checklist items (wizard step 3). Keys map to `leads.qualification` jsonb. */
export const QUALIFICATION_ITEMS: { key: string; label: string }[] = [
  { key: "budget_confirmed", label: "Budget confirmed" },
  { key: "decision_maker_identified", label: "Decision maker identified" },
  { key: "brief_received", label: "Event brief received" },
  { key: "guest_count_validated", label: "Guest count validated" },
  { key: "date_confirmed", label: "Event date confirmed" },
  { key: "timeline_understood", label: "Timeline understood" },
  { key: "venue_type_aligned", label: "Venue type aligned" },
  { key: "competition_assessed", label: "Competition assessed" },
  { key: "procurement_understood", label: "Procurement requirements understood" },
  { key: "deposit_readiness", label: "Deposit readiness checked" },
  { key: "consent_captured", label: "Data protection / contact consent captured" },
];

/** Next-action templates (wizard step 3 quick-add list). */
export const NEXT_ACTION_TEMPLATES = [
  "Schedule discovery call",
  "Send brochure",
  "Prepare proposal",
  "Build venue shortlist",
];

export interface NextAction {
  id: string;
  label: string;
  done: boolean;
}

export interface QualificationState {
  [key: string]: boolean;
}

export interface LeadScoreBreakdown {
  fit: number;
  budget: number;
  need: number;
  timing: number;
  engagement: number;
}

const SCORE_MAX: LeadScoreBreakdown = { fit: 25, budget: 25, need: 25, timing: 15, engagement: 10 };

/**
 * Deterministic lead-scoring rules engine (documented fallback used when no AI
 * scoring provider is configured — see AGENTS.md AI section, "no fake AI score").
 */
export function computeLeadScore(input: {
  hasCompany: boolean;
  hasBudget: boolean;
  budgetCents: number | null;
  hasEventDate: boolean;
  hasVenue: boolean;
  guestCount: number | null;
  source: string | null;
  qualification: QualificationState;
}): { total: number; breakdown: LeadScoreBreakdown } {
  const qualifiedCount = Object.values(input.qualification).filter(Boolean).length;
  const qualificationRatio = qualifiedCount / Math.max(1, QUALIFICATION_ITEMS.length);

  const fit = Math.round((input.hasCompany ? 0.6 : 0.3) * SCORE_MAX.fit + qualificationRatio * 0.4 * SCORE_MAX.fit);
  const budget = Math.round(
    (input.hasBudget ? 0.5 : 0.1) * SCORE_MAX.budget +
      (input.budgetCents && input.budgetCents > 5_000_00 ? 0.5 : 0.2) * SCORE_MAX.budget
  );
  const need = Math.round((input.hasEventDate ? 0.5 : 0.2) * SCORE_MAX.need + (input.hasVenue ? 0.5 : 0.2) * SCORE_MAX.need);
  const timing = Math.round(input.hasEventDate ? SCORE_MAX.timing * 0.8 : SCORE_MAX.timing * 0.3);
  const sourceWeight = input.source === "referral" || input.source === "website" ? 1 : 0.6;
  const engagement = Math.round(sourceWeight * SCORE_MAX.engagement);

  const breakdown: LeadScoreBreakdown = {
    fit: Math.min(fit, SCORE_MAX.fit),
    budget: Math.min(budget, SCORE_MAX.budget),
    need: Math.min(need, SCORE_MAX.need),
    timing: Math.min(timing, SCORE_MAX.timing),
    engagement: Math.min(engagement, SCORE_MAX.engagement),
  };

  const total = breakdown.fit + breakdown.budget + breakdown.need + breakdown.timing + breakdown.engagement;
  return { total, breakdown };
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Weak";
}
