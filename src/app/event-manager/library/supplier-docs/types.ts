// Supplier Documents screen — shared types.
//
// Schema bridge note (read this before touching queries/actions in this folder):
// There is no first-class link between `library_assets` (the general Files &
// Asset Library table this screen renders from) and the mature supplier
// compliance system (`supplier_files` + `supplier_document_requirements`,
// added by migration 20260711_supplier_rfq_depth.sql and already wired into
// the Suppliers section — see src/app/event-manager/suppliers/_data/queries.ts).
// `supplier_document_requirements` only defines REQUIRED DOCUMENT TYPES per
// supplier category (document_type, is_required, default_risk_level) — it has
// no supplier_id and no file reference, so it cannot itself carry a per-file
// verification status.
//
// Until a real migration adds a join (e.g. a `library_asset_id` column on
// `supplier_files`, or a `supplier_id` + `library_asset_id` link table), this
// screen models verification workflow fields directly on
// `library_assets.metadata` (jsonb) — see `SupplierDocMetadata` below — and
// cross-references `supplier_document_requirements` only to work out which
// required document types a linked supplier is missing entirely (i.e. no
// matching library_assets row exists yet). "Request Documents" writes a real
// row to `supplier_compliance_outreach` (also added by the same migration,
// already used by the Suppliers section to drive its chaser/outreach UI) so
// that action is fully real, not a placeholder.

export type VerificationStatus = "verified" | "pending_review" | "expiring_soon" | "expired" | "rejected" | "missing";

export type RiskLevel = "critical" | "high" | "medium" | "low";

/** Shape we read/write inside `library_assets.metadata` for supplier documents. */
export interface SupplierDocMetadata {
  documentType?: string;
  category?: string;
  expiryDate?: string | null;
  relatedEventId?: string | null;
  riskLevel?: RiskLevel;
  verificationStatus?: Exclude<VerificationStatus, "expiring_soon" | "expired" | "missing">;
  verifiedBy?: string;
  verifiedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface DocRow {
  id: string;
  isSynthetic: boolean; // true = "missing" placeholder for an unfulfilled requirement, no real file
  title: string;
  kind: string;
  documentType: string;
  mime: string | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  storagePath: string | null;
  supplierId: string | null;
  supplierName: string | null;
  category: string;
  expiryDate: string | null;
  relatedEventId: string | null;
  relatedEventName: string | null;
  riskLevel: RiskLevel | null;
  ownerUserId: string | null;
  ownerName: string;
  visibility: string;
  status: VerificationStatus;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface SupplierCompletionRow {
  supplierId: string;
  supplierName: string;
  required: number;
  fulfilled: number;
  completionPct: number;
}

export interface ExpiringDocRow {
  id: string;
  title: string;
  supplierName: string | null;
  expiryDate: string;
  daysUntil: number;
}

export interface ComplianceAlertRow {
  label: string;
  value: number;
}

export interface RecentActivityRow {
  id: string;
  title: string;
  supplierName: string | null;
  action: "verified" | "rejected";
  actorName: string;
  at: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface SupplierDocsKpis {
  total: number;
  verified: number;
  expiringSoon: number;
  pendingReview: number;
  missing: number;
  rejected: number;
}
