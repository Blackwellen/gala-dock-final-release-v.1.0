/**
 * Pause / archive reason vocabularies, shared between the live query mapper
 * (`queries.ts`), the server actions (`../actions.ts`) and any client-side
 * reason-picker UI. Values match the CHECK constraints on `supplier_pauses`
 * and `supplier_archives` in `20260711_supplier_rfq_depth.sql` exactly —
 * do not add a value here without also updating that migration.
 */

export interface ReasonOption {
  value: string;
  label: string;
}

export const PAUSE_REASONS: ReasonOption[] = [
  { value: "low_utilisation", label: "Low Utilisation" },
  { value: "seasonal", label: "Seasonal" },
  { value: "project_complete", label: "Project Complete" },
  { value: "capacity_constraints", label: "Capacity Constraints" },
  { value: "strategic_review", label: "Strategic Review" },
  { value: "supplier_consolidation", label: "Supplier Consolidation" },
  { value: "regulatory_hold", label: "Regulatory Hold" },
  { value: "performance_review", label: "Performance Review" },
  { value: "commercial_dispute", label: "Commercial Dispute" },
  { value: "requested_by_supplier", label: "Requested by Supplier" },
  { value: "other", label: "Other" },
];

export const ARCHIVE_REASONS: ReasonOption[] = [
  { value: "business_closed", label: "Business Closed" },
  { value: "out_of_business", label: "Out of Business" },
  { value: "no_longer_working_with_us", label: "No Longer Working With Us" },
  { value: "performance_issues", label: "Performance Issues" },
  { value: "duplicate_supplier", label: "Duplicate Supplier" },
  { value: "seasonal_pause", label: "Seasonal Pause" },
  { value: "contract_ended", label: "Contract Ended" },
  { value: "compliance_failure", label: "Compliance Failure" },
  { value: "supplier_request", label: "Supplier Request" },
  { value: "commercial_decision", label: "Commercial Decision" },
  { value: "other", label: "Other" },
];

const PAUSE_LABELS = new Map(PAUSE_REASONS.map((r) => [r.value, r.label]));
const ARCHIVE_LABELS = new Map(ARCHIVE_REASONS.map((r) => [r.value, r.label]));

export function pauseReasonLabel(value: string | null | undefined): string {
  if (!value) return "Other";
  return PAUSE_LABELS.get(value) ?? value;
}

export function archiveReasonLabel(value: string | null | undefined): string {
  if (!value) return "Other";
  return ARCHIVE_LABELS.get(value) ?? value;
}

export function isValidPauseReason(value: string): boolean {
  return PAUSE_LABELS.has(value);
}

export function isValidArchiveReason(value: string): boolean {
  return ARCHIVE_LABELS.has(value);
}
