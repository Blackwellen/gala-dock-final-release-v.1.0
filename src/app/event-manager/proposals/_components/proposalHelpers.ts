import type { Proposal, ProposalStatus } from "@/lib/supabase/types";
import { isExpired } from "../_lib/proposals";

/** Resolved effective status, folding in the isExpired override. */
export function effectiveStatus(p: Proposal): ProposalStatus {
  const status = p.status as ProposalStatus;
  if (isExpired(p.valid_until, status)) return "expired";
  return status;
}

/** Stable, purely-cosmetic display code derived from the proposal id — not persisted. */
export function proposalCode(p: Proposal): string {
  const year = new Date(p.created_at).getFullYear();
  const shortId = p.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PR-${year}-${shortId}`;
}

/** Sensible default "next action" copy derived from status when next_action_label is unset. */
export function nextActionLabel(p: Proposal): string {
  if (p.next_action_label) return p.next_action_label;
  const status = effectiveStatus(p);
  switch (status) {
    case "draft":
      return "Complete & send";
    case "sent":
      return "Send reminder";
    case "viewed":
      return "Follow up";
    case "signed":
      return "Send invoice";
    case "converted":
      return "View invoice";
    case "declined":
      return "Review feedback";
    case "expired":
      return "Renew or close";
    default:
      return "—";
  }
}

export type SortOption = "newest" | "oldest" | "highest-value" | "expiring-soonest";

export const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "newest", label: "Newest First" },
  { id: "oldest", label: "Oldest First" },
  { id: "highest-value", label: "Highest Value" },
  { id: "expiring-soonest", label: "Expiring Soonest" },
];

export function sortProposals(rows: Proposal[], sort: SortOption): Proposal[] {
  const copy = [...rows];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    case "highest-value":
      return copy.sort((a, b) => (b.total_cents ?? 0) - (a.total_cents ?? 0));
    case "expiring-soonest":
      return copy.sort((a, b) => {
        const aDate = a.valid_until ? new Date(a.valid_until).getTime() : Infinity;
        const bDate = b.valid_until ? new Date(b.valid_until).getTime() : Infinity;
        return aDate - bDate;
      });
    case "newest":
    default:
      return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export type DateRangePreset = "all" | "30d" | "90d";

export const DATE_RANGE_OPTIONS: { id: DateRangePreset; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
];

export function withinDateRange(p: Proposal, range: DateRangePreset): boolean {
  if (range === "all") return true;
  const days = range === "30d" ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(p.created_at).getTime() >= cutoff;
}

export interface SavedView {
  id: string;
  label: string;
  apply: {
    status?: ProposalStatus | "all";
    expiringSoon?: boolean;
  };
}

export const SAVED_VIEWS: SavedView[] = [
  { id: "awaiting-my-signature", label: "Awaiting My Signature", apply: { status: "sent" } },
  { id: "expiring-soon", label: "Expiring Soon", apply: { expiringSoon: true } },
  { id: "signed", label: "Signed This Period", apply: { status: "signed" } },
];

/** Whether a proposal expires within `days` days and hasn't already resolved. */
export function isExpiringSoon(p: Proposal, days = 30): boolean {
  if (!p.valid_until) return false;
  const status = effectiveStatus(p);
  if (["signed", "converted", "declined", "expired"].includes(status)) return false;
  const due = new Date(p.valid_until).getTime();
  const now = Date.now();
  const soon = now + days * 24 * 60 * 60 * 1000;
  return due >= now && due <= soon;
}

export function daysUntil(dateStr: string): number {
  const due = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((due - now) / (24 * 60 * 60 * 1000)));
}
