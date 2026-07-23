/**
 * Phase-1 visual-layer types for the Suppliers / RFQs rebuild.
 *
 * These mirror the eventual Supabase schema shape so a later phase can swap
 * the demo data generator for live queries with minimal churn:
 *  - SupplierRecord ≈ `suppliers` + `supplier_categories` + `supplier_contacts`
 *    + `supplier_files` + a future `supplier_pauses` / `supplier_archives`
 *    audit table.
 *  - RfqRecord ≈ `rfqs` + `rfq_recipients` + `events`.
 *
 * No database/RLS/R2 work happens in this phase — this file only exists to
 * give the UI a stable, typed contract.
 */

export type SupplierStatus =
  | "active"
  | "paused"
  | "archived"
  | "draft"
  | "invited"
  | "onboarding"
  | "suspended";

export type SupplierTier = "premium" | "preferred" | "verified" | null;

export type RiskLevel = "high" | "medium" | "low";

export type OutreachStatus =
  | "not-contacted"
  | "chaser-sent"
  | "awaiting-response"
  | "responded"
  | "escalated";

export interface SupplierContact {
  name: string;
  email: string;
  phone: string;
}

export interface SupplierDocuments {
  required: number;
  approved: number;
  missingTypes: string[];
}

export interface SupplierPauseInfo {
  reason: string;
  reasonDetail: string;
  pausedAt: string; // ISO date
  notes: string;
}

export interface SupplierArchiveInfo {
  reason: string;
  reasonDetail: string;
  archivedAt: string; // ISO date
  archivedBy: { name: string; role: string };
  canBeRestored: boolean;
  retentionUntil: string; // ISO date
  lastActivityAt: string; // ISO date
}

export interface MissingDocumentEntry {
  type: string;
  dueDate: string; // ISO date
  overdue: boolean;
}

export interface SupplierRecord {
  id: string;
  name: string;
  logoInitials: string;
  logoColor: string; // tailwind bg-* class for the logo tile
  rating: number; // 0-5, one decimal
  tier: SupplierTier;
  primaryContact: SupplierContact;
  category: string;
  coverageRegions: string[];
  status: SupplierStatus;
  onboardingPct: number; // 0-100
  documents: SupplierDocuments;
  insuranceExpiryDate: string | null; // ISO date
  responseRatePct: number; // 0-100
  responseTrend: number[]; // sparkline points, 0-100 scale
  isStarred: boolean;
  lastBookedDate: string | null; // ISO date
  recentlyUsedAt: string | null; // ISO date, null if not used recently
  pause: SupplierPauseInfo | null;
  archive: SupplierArchiveInfo | null;
  complianceScore: number; // 0-100
  riskLevel: RiskLevel;
  missingDocuments: MissingDocumentEntry[];
  outreachStatus: OutreachStatus;
  lastContactAt: string | null; // ISO date
  upcomingBookingsCount: number;
  nextBookingDate: string | null; // ISO date
  recentSpend90d: number; // GBP
  performanceScore: number; // 0-100
  performanceLabel: "Excellent" | "Very Good" | "Good" | "Fair";
  eventCategories: string[];
  lastEventUsed: { name: string; location: string; date: string; category: string } | null;
  atRiskContractValue: number; // GBP, used on Missing Documents view
}

export type RfqStatus =
  | "draft"
  | "sent"
  | "responses-received"
  | "under-review"
  | "awarded"
  | "closed";

export interface RfqRecord {
  id: string;
  code: string; // "RFQ-2025-014"
  title: string;
  event: { name: string; date: string; location: string };
  category: string;
  suppliersInvited: number;
  responses: number;
  quoteRangeLow: number; // GBP
  quoteRangeHigh: number; // GBP
  dueDate: string; // ISO date
  status: RfqStatus;
  awardedSupplierName: string | null;
  createdAt: string; // ISO date
}
