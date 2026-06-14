import type { ProposalStatus } from "@/lib/supabase/types";

/**
 * Proposal status state machine (Step 17).
 * Defines allowed transitions; invalid transitions are blocked by callers.
 */
export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["sent"],
  sent: ["viewed", "declined", "expired", "signed"],
  viewed: ["signed", "declined", "expired"],
  signed: ["converted"],
  declined: ["draft"],
  expired: ["draft"],
  converted: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return (PROPOSAL_TRANSITIONS[from] ?? []).includes(to);
}

/** Generate a crypto-random, URL-safe share token. */
export function generateShareToken(): string {
  // 32 hex chars from crypto random bytes — collision-safe for share links.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Whether a proposal is past its valid_until date. */
export function isExpired(validUntil: string | null, status: ProposalStatus): boolean {
  if (!validUntil) return false;
  if (status === "signed" || status === "converted" || status === "declined") return false;
  const due = new Date(validUntil);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

/** Format integer pennies to a GBP string. */
export function formatPence(cents: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format((cents ?? 0) / 100);
}
