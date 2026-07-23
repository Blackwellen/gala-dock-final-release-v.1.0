import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupplierRecord } from "@/app/event-manager/suppliers/_data/types";
import { ANCHOR_DATE } from "@/app/event-manager/suppliers/_data/demo-data";
import {
  avg,
  isInsuranceExpiringSoon,
  hasMissingDocs,
  computeAllSuppliersKpis,
  computeArchivedSuppliersKpis,
  computeMissingDocumentsKpis,
  computeSupplierHealth,
  computeCategoryMix,
  computeComplianceRiskOverview,
  computeOverdueByDocType,
  computePauseReasons,
  computeArchiveReasons,
} from "@/app/event-manager/suppliers/_data/kpis";

function isoDaysFromAnchor(offset: number): string {
  const d = new Date(ANCHOR_DATE);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

/** Minimal, override-friendly SupplierRecord fixture builder. */
function supplier(overrides: Partial<SupplierRecord> = {}): SupplierRecord {
  return {
    id: "sup-1",
    name: "Test Supplier",
    logoInitials: "TS",
    logoColor: "bg-brand-500",
    rating: 4.5,
    tier: null,
    primaryContact: { name: "Jane Doe", email: "jane@test.co", phone: "+44 7700 000000" },
    category: "AV & Sound",
    coverageRegions: ["London"],
    status: "active",
    onboardingPct: 100,
    documents: { required: 3, approved: 3, missingTypes: [] },
    insuranceExpiryDate: isoDaysFromAnchor(90),
    responseRatePct: 80,
    responseTrend: [70, 75, 80],
    isStarred: false,
    lastBookedDate: isoDaysFromAnchor(-10),
    recentlyUsedAt: null,
    pause: null,
    archive: null,
    complianceScore: 90,
    riskLevel: "low",
    missingDocuments: [],
    outreachStatus: "not-contacted",
    lastContactAt: isoDaysFromAnchor(-5),
    upcomingBookingsCount: 0,
    nextBookingDate: null,
    recentSpend90d: 0,
    performanceScore: 85,
    performanceLabel: "Very Good",
    eventCategories: [],
    lastEventUsed: null,
    atRiskContractValue: 0,
    ...overrides,
  };
}

test("avg handles empty and non-empty arrays", () => {
  assert.equal(avg([]), 0);
  assert.equal(avg([10, 20, 30]), 20);
});

test("isInsuranceExpiringSoon is true only within the 0-30 day window", () => {
  assert.equal(isInsuranceExpiringSoon(supplier({ insuranceExpiryDate: isoDaysFromAnchor(15) })), true);
  assert.equal(isInsuranceExpiringSoon(supplier({ insuranceExpiryDate: isoDaysFromAnchor(0) })), true);
  assert.equal(isInsuranceExpiringSoon(supplier({ insuranceExpiryDate: isoDaysFromAnchor(31) })), false);
  assert.equal(isInsuranceExpiringSoon(supplier({ insuranceExpiryDate: isoDaysFromAnchor(-1) })), false); // already expired, not "expiring soon"
  assert.equal(isInsuranceExpiringSoon(supplier({ insuranceExpiryDate: null })), false);
});

test("hasMissingDocs mirrors documents.missingTypes", () => {
  assert.equal(hasMissingDocs(supplier()), false);
  assert.equal(hasMissingDocs(supplier({ documents: { required: 2, approved: 1, missingTypes: ["RAMS"] } })), true);
});

test("computeAllSuppliersKpis counts each status bucket independently", () => {
  const data = [
    supplier({ id: "1", status: "active" }),
    supplier({ id: "2", status: "active", documents: { required: 2, approved: 1, missingTypes: ["RAMS"] } }),
    supplier({ id: "3", status: "paused" }),
    supplier({ id: "4", status: "archived" }),
  ];
  const kpis = computeAllSuppliersKpis(data);
  assert.equal(kpis.total, 4);
  assert.equal(kpis.active, 2);
  assert.equal(kpis.paused, 1);
  assert.equal(kpis.missingDocs, 1);
});

test("computeArchivedSuppliersKpis only counts archived records and respects canBeRestored", () => {
  const archiveInfo = (canBeRestored: boolean) => ({
    reason: "business_closed",
    reasonDetail: "",
    archivedAt: isoDaysFromAnchor(-10),
    archivedBy: { name: "Owner", role: "owner" },
    canBeRestored,
    retentionUntil: isoDaysFromAnchor(2000),
    lastActivityAt: isoDaysFromAnchor(-20),
  });
  const data = [
    supplier({ id: "1", status: "archived", archive: archiveInfo(true) }),
    supplier({ id: "2", status: "archived", archive: archiveInfo(false) }),
    supplier({ id: "3", status: "active" }),
  ];
  const kpis = computeArchivedSuppliersKpis(data);
  assert.equal(kpis.totalArchived, 2);
  assert.equal(kpis.canBeRestored, 1);
  assert.equal(kpis.permanentlyExpired, 1);
});

test("computeMissingDocumentsKpis aggregates overdue vs expiring-soon docs and at-risk value", () => {
  const data = [
    supplier({
      id: "1",
      riskLevel: "high",
      missingDocuments: [
        { type: "Public Liability Insurance", dueDate: isoDaysFromAnchor(-5), overdue: true },
        { type: "RAMS", dueDate: isoDaysFromAnchor(10), overdue: false },
      ],
      documents: { required: 2, approved: 0, missingTypes: ["Public Liability Insurance", "RAMS"] },
      atRiskContractValue: 5000,
    }),
    supplier({ id: "2" }), // fully compliant, contributes nothing to "missing" totals
  ];
  const kpis = computeMissingDocumentsKpis(data);
  assert.equal(kpis.highRiskSuppliers, 1);
  assert.equal(kpis.overdueDocuments, 1);
  assert.equal(kpis.expiring30Days, 1);
  assert.equal(kpis.totalMissingDocuments, 2);
  assert.equal(kpis.atRiskContractValue, 5000);
});

test("computeSupplierHealth excludes archived suppliers and buckets sum to the total", () => {
  const data = [
    supplier({ id: "1", status: "active" }), // healthy
    supplier({ id: "2", status: "active", insuranceExpiryDate: isoDaysFromAnchor(-3) }), // expired
    supplier({ id: "3", status: "active", riskLevel: "high" }), // at risk
    supplier({
      id: "4",
      status: "active",
      documents: { required: 3, approved: 1, missingTypes: ["A", "B"] },
    }), // incomplete (approved < required - 1)
    supplier({ id: "5", status: "archived" }), // excluded entirely
  ];
  const health = computeSupplierHealth(data);
  const byLabel = Object.fromEntries(health.map((h) => [h.label, h.value]));
  assert.equal(byLabel["Healthy"], 1);
  assert.equal(byLabel["Expired"], 1);
  assert.equal(byLabel["At Risk"], 1);
  assert.equal(byLabel["Incomplete"], 1);
  assert.equal(health.reduce((s, h) => s + h.value, 0), 4); // archived record excluded
});

test("computeCategoryMix sorts by count descending and caps at 6 categories", () => {
  const cats = ["A", "A", "A", "B", "B", "C", "D", "E", "F", "G", "H"];
  const data = cats.map((c, i) => supplier({ id: String(i), category: c }));
  const mix = computeCategoryMix(data);
  assert.equal(mix.length, 6);
  assert.equal(mix[0].label, "A");
  assert.equal(mix[0].value, 3);
});

test("computeComplianceRiskOverview splits flagged suppliers by risk level and counts compliant separately", () => {
  const data = [
    supplier({ id: "1", riskLevel: "high", documents: { required: 1, approved: 0, missingTypes: ["X"] } }),
    supplier({ id: "2", riskLevel: "medium", documents: { required: 1, approved: 0, missingTypes: ["X"] } }),
    supplier({ id: "3" }), // compliant
  ];
  const overview = computeComplianceRiskOverview(data);
  assert.equal(overview.atRiskCount, 2);
  const byLabel = Object.fromEntries(overview.segments.map((s) => [s.label, s.value]));
  assert.equal(byLabel["High Risk"], 1);
  assert.equal(byLabel["Medium Risk"], 1);
  assert.equal(byLabel["Compliant"], 1);
});

test("computeOverdueByDocType only counts overdue entries, sorted descending", () => {
  const data = [
    supplier({
      id: "1",
      missingDocuments: [
        { type: "RAMS", dueDate: isoDaysFromAnchor(-1), overdue: true },
        { type: "RAMS", dueDate: isoDaysFromAnchor(5), overdue: false },
      ],
    }),
    supplier({
      id: "2",
      missingDocuments: [{ type: "RAMS", dueDate: isoDaysFromAnchor(-2), overdue: true }],
    }),
    supplier({
      id: "3",
      missingDocuments: [{ type: "Food Hygiene Certificate", dueDate: isoDaysFromAnchor(-3), overdue: true }],
    }),
  ];
  const result = computeOverdueByDocType(data);
  assert.equal(result[0].label, "RAMS");
  assert.equal(result[0].value, 2);
});

test("computePauseReasons/computeArchiveReasons only look at their own status bucket", () => {
  const data = [
    supplier({ id: "1", status: "paused", pause: { reason: "seasonal", reasonDetail: "", pausedAt: isoDaysFromAnchor(-10), notes: "" } }),
    supplier({ id: "2", status: "paused", pause: { reason: "seasonal", reasonDetail: "", pausedAt: isoDaysFromAnchor(-20), notes: "" } }),
    supplier({
      id: "3",
      status: "archived",
      archive: {
        reason: "business_closed",
        reasonDetail: "",
        archivedAt: isoDaysFromAnchor(-5),
        archivedBy: { name: "Owner", role: "owner" },
        canBeRestored: true,
        retentionUntil: isoDaysFromAnchor(2000),
        lastActivityAt: isoDaysFromAnchor(-15),
      },
    }),
  ];
  const pauseReasons = computePauseReasons(data);
  assert.equal(pauseReasons.length, 1);
  assert.equal(pauseReasons[0].value, 2);

  const archiveReasons = computeArchiveReasons(data);
  assert.equal(archiveReasons.length, 1);
  assert.equal(archiveReasons[0].value, 1);
});
