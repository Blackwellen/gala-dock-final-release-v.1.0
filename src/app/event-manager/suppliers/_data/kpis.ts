import type { RfqRecord, RiskLevel, SupplierRecord } from "./types";
import { daysFromToday, formatGBP, relativePast } from "./format";

/* ─── Shared aggregate helpers ───────────────────────────────────────── */

export function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const INSURANCE_SOON_DAYS = 30;

export function isInsuranceExpiringSoon(s: SupplierRecord): boolean {
  const n = daysFromToday(s.insuranceExpiryDate);
  return n !== null && n >= 0 && n <= INSURANCE_SOON_DAYS;
}

export function hasMissingDocs(s: SupplierRecord): boolean {
  return s.documents.missingTypes.length > 0;
}

/* ─── KPI rows per view ──────────────────────────────────────────────── */

export function computeAllSuppliersKpis(all: SupplierRecord[]) {
  const active = all.filter((s) => s.status === "active");
  const paused = all.filter((s) => s.status === "paused");
  const missing = all.filter(hasMissingDocs);
  const insuranceSoon = all.filter(isInsuranceExpiringSoon);
  return {
    total: all.length,
    active: active.length,
    paused: paused.length,
    missingDocs: missing.length,
    insuranceExpiringSoon: insuranceSoon.length,
    avgResponseRate: Math.round(avg(active.map((s) => s.responseRatePct))),
    avgLeadTimeDays: Math.round(avg(active.map((s) => 3 + (s.rating * 2)))),
  };
}

export function computeActiveSuppliersKpis(all: SupplierRecord[]) {
  const active = all.filter((s) => s.status === "active");
  const fullyOnboarded = active.filter((s) => s.onboardingPct === 100);
  const completeDocs = active.filter((s) => !hasMissingDocs(s));
  const insuranceCurrent = active.filter((s) => !isInsuranceExpiringSoon(s) && daysFromToday(s.insuranceExpiryDate) !== null && (daysFromToday(s.insuranceExpiryDate) as number) > 0);
  return {
    active: active.length,
    fullyOnboarded: fullyOnboarded.length,
    completeDocs: completeDocs.length,
    insuranceCurrent: insuranceCurrent.length,
    avgResponseRate: Math.round(avg(active.map((s) => s.responseRatePct))),
    avgLeadTimeDays: Math.round(avg(active.map((s) => 3 + (s.rating * 2)))),
  };
}

export function computePausedSuppliersKpis(all: SupplierRecord[]) {
  const active = all.filter((s) => s.status === "active");
  const paused = all.filter((s) => s.status === "paused");
  return {
    total: all.length,
    active: active.length,
    paused: paused.length,
    missingDocs: all.filter(hasMissingDocs).length,
    insuranceExpiringSoon: all.filter(isInsuranceExpiringSoon).length,
    avgResponseRate: Math.round(avg(active.map((s) => s.responseRatePct))),
  };
}

export function computeArchivedSuppliersKpis(all: SupplierRecord[]) {
  const archived = all.filter((s) => s.status === "archived");
  const thisMonth = archived.filter((s) => (daysFromToday(s.archive?.archivedAt) ?? -999) >= -30);
  const canRestore = archived.filter((s) => s.archive?.canBeRestored);
  const permanentlyExpired = archived.filter((s) => !s.archive?.canBeRestored);
  const avgDaysToArchive = avg(
    archived.map((s) => Math.abs((daysFromToday(s.archive?.archivedAt) ?? 0) - (daysFromToday(s.archive?.lastActivityAt) ?? 0)))
  );
  return {
    totalArchived: archived.length,
    archivedThisMonth: thisMonth.length,
    avgTimeToArchiveDays: Math.round(avgDaysToArchive),
    canBeRestored: canRestore.length,
    permanentlyExpired: permanentlyExpired.length,
    dataRetentionYears: 6,
  };
}

export function computeMissingDocumentsKpis(all: SupplierRecord[]) {
  const flagged = all.filter(hasMissingDocs);
  const highRisk = flagged.filter((s) => s.riskLevel === "high");
  const overdue = flagged.flatMap((s) => s.missingDocuments.filter((d) => d.overdue));
  const expiring30 = flagged.flatMap((s) => s.missingDocuments.filter((d) => !d.overdue && (daysFromToday(d.dueDate) ?? 999) <= 30));
  const totalMissingDocs = flagged.reduce((sum, s) => sum + s.missingDocuments.length, 0);
  const atRiskValue = flagged.reduce((sum, s) => sum + s.atRiskContractValue, 0);
  const complianceScore = Math.round(avg(all.map((s) => s.complianceScore)));
  return {
    highRiskSuppliers: highRisk.length,
    overdueDocuments: overdue.length,
    expiring30Days: expiring30.length,
    totalMissingDocuments: totalMissingDocs,
    atRiskContractValue: atRiskValue,
    complianceScore,
  };
}

export function computeRecentlyUsedKpis(all: SupplierRecord[]) {
  const active = all.filter((s) => s.status === "active");
  const recentlyUsed = all.filter((s) => s.recentlyUsedAt !== null);
  const leadTimes = recentlyUsed.map((s) => Math.abs(daysFromToday(s.lastBookedDate) ?? 0));
  const repeatBookers = recentlyUsed.filter((s) => s.upcomingBookingsCount > 0);
  return {
    total: all.length,
    active: active.length,
    recentlyUsedThisMonth: recentlyUsed.length,
    avgResponseRate: Math.round(avg(active.map((s) => s.responseRatePct))),
    lastBookedVelocityDays: Math.round(avg(leadTimes)),
    repeatBookingRate: recentlyUsed.length > 0 ? Math.round((repeatBookers.length / recentlyUsed.length) * 100) : 0,
  };
}

/* ─── Right-rail widgets (shared across views) ──────────────────────── */

export function computeSupplierHealth(all: SupplierRecord[]) {
  let healthy = 0, atRisk = 0, expired = 0, incomplete = 0;
  for (const s of all) {
    if (s.status === "archived") continue;
    const expDays = daysFromToday(s.insuranceExpiryDate);
    if (hasMissingDocs(s) && s.documents.approved < s.documents.required - 1) incomplete++;
    else if (expDays !== null && expDays < 0) expired++;
    else if (isInsuranceExpiringSoon(s) || s.riskLevel === "high") atRisk++;
    else healthy++;
  }
  const total = healthy + atRisk + expired + incomplete || 1;
  return [
    { label: "Healthy", value: healthy, color: "bg-success-500", pct: Math.round((healthy / total) * 100) },
    { label: "At Risk", value: atRisk, color: "bg-warning-500", pct: Math.round((atRisk / total) * 100) },
    { label: "Expired", value: expired, color: "bg-danger-500", pct: Math.round((expired / total) * 100) },
    { label: "Incomplete", value: incomplete, color: "bg-surface-400", pct: Math.round((incomplete / total) * 100) },
  ];
}

export function computeCategoryMix(all: SupplierRecord[], statusFilter?: SupplierRecord["status"]) {
  const scoped = statusFilter ? all.filter((s) => s.status === statusFilter) : all;
  const counts = new Map<string, number>();
  for (const s of scoped) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value], i) => ({
      label,
      value,
      valueLabel: String(value),
      color: ["bg-brand-500", "bg-violet-500", "bg-info-500", "bg-success-500", "bg-warning-500", "bg-danger-500"][i % 6],
    }));
}

export function computeComplianceSnapshot(all: SupplierRecord[]) {
  const scored = all.filter((s) => s.status !== "archived");
  const avgScore = Math.round(avg(scored.map((s) => s.complianceScore)));
  const trend = Array.from({ length: 6 }, (_, i) => {
    const shifted = scored.filter((_, idx) => idx % 6 === i);
    return Math.round(avg(shifted.map((s) => s.complianceScore)) || avgScore);
  });
  return { avgScore, trend };
}

export function computeRecentActivity(all: SupplierRecord[], limit = 6) {
  const events: { name: string; text: string; timestamp: string; initials: string; color: string }[] = [];
  const sorted = [...all].sort((a, b) => (daysFromToday(b.lastContactAt) ?? 0) - (daysFromToday(a.lastContactAt) ?? 0));
  for (const s of sorted.slice(0, limit)) {
    const verb = s.status === "paused" ? "was paused" : s.status === "archived" ? "was archived" : hasMissingDocs(s) ? "flagged for missing documents" : "documents verified";
    events.push({
      name: s.name,
      text: `${s.name} ${verb}`,
      timestamp: relativePast(s.lastContactAt),
      initials: s.logoInitials,
      color: s.logoColor,
    });
  }
  return events;
}

/* ─── Paused view rail ───────────────────────────────────────────────── */

export function computePauseReasons(all: SupplierRecord[]) {
  const paused = all.filter((s) => s.status === "paused");
  const counts = new Map<string, number>();
  for (const s of paused) {
    const reason = s.pause?.reason ?? "Other";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const colors = ["bg-warning-500", "bg-danger-500", "bg-info-500", "bg-violet-500", "bg-brand-500", "bg-surface-400"];
  return [...counts.entries()].map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
}

export function computeDormantSuppliers(all: SupplierRecord[], limit = 5) {
  return all
    .filter((s) => s.status === "paused")
    .map((s) => ({ name: s.name, days: Math.abs(daysFromToday(s.pause?.pausedAt) ?? 0) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, limit);
}

export function computeReactivationOpportunities(all: SupplierRecord[], limit = 4) {
  return all
    .filter((s) => s.status === "paused")
    .map((s) => ({
      name: s.name,
      fit: s.rating >= 4.4 ? ("High" as const) : ("Medium" as const),
      note: s.pause?.reasonDetail ?? "",
    }))
    .sort((a, b) => (a.fit === b.fit ? 0 : a.fit === "High" ? -1 : 1))
    .slice(0, limit);
}

export function computeRecentAdminActions(all: SupplierRecord[], limit = 5) {
  const paused = [...all.filter((s) => s.status === "paused")].sort(
    (a, b) => (daysFromToday(b.pause?.pausedAt) ?? 0) - (daysFromToday(a.pause?.pausedAt) ?? 0)
  );
  const admins = ["Priya Anand", "Tom Fletcher", "Sasha Whitfield", "Marcus Lee", "Nadia Osei"];
  return paused.slice(0, limit).map((s, i) => ({
    admin: admins[i % admins.length],
    text: `Paused ${s.name} — ${s.pause?.reason}`,
    timestamp: relativePast(s.pause?.pausedAt),
  }));
}

/* ─── Archived view rail ─────────────────────────────────────────────── */

export function computeArchiveReasons(all: SupplierRecord[]) {
  const archived = all.filter((s) => s.status === "archived");
  const counts = new Map<string, number>();
  for (const s of archived) {
    const reason = s.archive?.reason ?? "Other";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const colors = ["bg-surface-400", "bg-danger-500", "bg-warning-500", "bg-info-500", "bg-violet-500", "bg-brand-500"];
  return [...counts.entries()].map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
}

export function computeArchivedOverTime(all: SupplierRecord[]) {
  const archived = all.filter((s) => s.status === "archived");
  const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
  return months.map((label, i) => {
    const count = archived.filter((s) => Math.floor(Math.abs((daysFromToday(s.archive?.archivedAt) ?? 0)) / 30) === 11 - i).length;
    return { label, value: count, valueLabel: String(count) };
  });
}

export function computeRetentionPolicy(all: SupplierRecord[]) {
  const archived = all.filter((s) => s.status === "archived");
  const permanentlyExpired = archived.filter((s) => !s.archive?.canBeRestored);
  const next = archived
    .filter((s) => s.archive?.canBeRestored === false)
    .sort((a, b) => (daysFromToday(a.archive?.retentionUntil) ?? 0) - (daysFromToday(b.archive?.retentionUntil) ?? 0))[0];
  return {
    retentionYears: 6,
    autoDeleteEnabled: true,
    deletionsLast12mo: permanentlyExpired.length,
    nextScheduledDeletion: next?.archive?.retentionUntil ?? null,
  };
}

/* ─── Missing documents view rail ───────────────────────────────────── */

export function computeComplianceRiskOverview(all: SupplierRecord[]) {
  const flagged = all.filter(hasMissingDocs);
  const compliant = all.filter((s) => !hasMissingDocs(s) && s.status !== "archived");
  const byRisk: Record<RiskLevel, number> = { high: 0, medium: 0, low: 0 };
  for (const s of flagged) byRisk[s.riskLevel]++;
  return {
    segments: [
      { label: "High Risk", value: byRisk.high, color: "bg-danger-500" },
      { label: "Medium Risk", value: byRisk.medium, color: "bg-warning-500" },
      { label: "Low Risk", value: byRisk.low, color: "bg-info-500" },
      { label: "Compliant", value: compliant.length, color: "bg-success-500" },
    ],
    atRiskCount: flagged.length,
  };
}

export function computeOverdueByDocType(all: SupplierRecord[]) {
  const counts = new Map<string, number>();
  for (const s of all) {
    for (const d of s.missingDocuments) {
      if (!d.overdue) continue;
      counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
    }
  }
  const colors = ["bg-danger-500", "bg-warning-500", "bg-brand-500", "bg-violet-500", "bg-info-500"];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value], i) => ({ label, value, valueLabel: String(value), color: colors[i % colors.length] }));
}

export function computeRecentChaserActivity(all: SupplierRecord[], limit = 5) {
  const flagged = [...all.filter(hasMissingDocs)].sort(
    (a, b) => (daysFromToday(b.lastContactAt) ?? 0) - (daysFromToday(a.lastContactAt) ?? 0)
  );
  const verbForOutreach: Record<string, string> = {
    "chaser-sent": "Chaser email sent to",
    "awaiting-response": "Awaiting response from",
    escalated: "Escalated missing documents for",
    "not-contacted": "Flagged (not yet contacted):",
    responded: "Documents received from",
  };
  return flagged.slice(0, limit).map((s) => ({
    text: `${verbForOutreach[s.outreachStatus]} ${s.name}`,
    timestamp: relativePast(s.lastContactAt),
  }));
}

/* ─── Recently used view rail ────────────────────────────────────────── */

export function computeTopBookedCategories(all: SupplierRecord[]) {
  return computeCategoryMix(all.filter((s) => s.recentlyUsedAt !== null));
}

export function computeUpcomingEventAllocations(all: SupplierRecord[], limit = 4) {
  const withBookings = all.filter((s) => s.nextBookingDate !== null && s.status === "active");
  const byEvent = new Map<string, { date: string; count: number }>();
  for (const s of withBookings) {
    const key = s.lastEventUsed?.name ?? "Upcoming Event";
    const existing = byEvent.get(key);
    if (existing) existing.count++;
    else byEvent.set(key, { date: s.nextBookingDate as string, count: 1 });
  }
  return [...byEvent.entries()]
    .slice(0, limit)
    .map(([name, v]) => ({ name, date: v.date, count: v.count }));
}

export function computePerformanceTrend(all: SupplierRecord[]) {
  const recentlyUsed = all.filter((s) => s.recentlyUsedAt !== null);
  const avgScore = Math.round(avg(recentlyUsed.map((s) => s.performanceScore)));
  const trend = Array.from({ length: 9 }, (_, i) => {
    const shifted = recentlyUsed.filter((_, idx) => idx % 9 === i);
    return Math.round(avg(shifted.map((s) => s.performanceScore)) || avgScore);
  });
  return { avgScore, trend };
}

/* ─── RFQ view ───────────────────────────────────────────────────────── */

export function computeRfqKpis(rfqs: RfqRecord[]) {
  const active = rfqs.filter((r) => r.status === "sent" || r.status === "responses-received" || r.status === "under-review");
  const awarded = rfqs.filter((r) => r.status === "awarded");
  const totalResponses = rfqs.reduce((sum, r) => sum + r.responses, 0);
  const projectedValue = rfqs.reduce((sum, r) => sum + (r.quoteRangeLow + r.quoteRangeHigh) / 2, 0);
  const estimatedSavings = rfqs.reduce((sum, r) => sum + (r.quoteRangeHigh - r.quoteRangeLow) * 0.35, 0);
  return {
    total: rfqs.length,
    active: active.length,
    responsesReceived: totalResponses,
    awarded: awarded.length,
    avgResponseTimeHrs: 18 + (rfqs.length % 12),
    projectedValue: Math.round(projectedValue),
    estimatedSavings: Math.round(estimatedSavings),
  };
}

export function computeResponseAnalytics(rfqs: RfqRecord[]) {
  let responded = 0, pending = 0, declined = 0, noResponse = 0;
  for (const r of rfqs) {
    const invited = r.suppliersInvited;
    const resp = r.responses;
    responded += resp;
    if (r.status === "draft") noResponse += invited;
    else if (r.status === "closed") declined += Math.max(0, invited - resp);
    else pending += Math.max(0, invited - resp);
  }
  return [
    { label: "Responded", value: responded, color: "bg-success-500" },
    { label: "Pending", value: pending, color: "bg-warning-500" },
    { label: "Declined", value: declined, color: "bg-danger-500" },
    { label: "No Response", value: noResponse, color: "bg-surface-400" },
  ];
}

export function computeAwardRate(rfqs: RfqRecord[]) {
  const closed = rfqs.filter((r) => r.status === "awarded" || r.status === "closed");
  const awarded = rfqs.filter((r) => r.status === "awarded");
  const rate = closed.length > 0 ? Math.round((awarded.length / closed.length) * 100) : 0;
  const trend = Array.from({ length: 7 }, (_, i) => Math.max(20, Math.min(100, rate - 15 + i * 5)));
  return { rate, awarded: awarded.length, total: closed.length, trend };
}

export function computeRecentSupplierResponses(rfqs: RfqRecord[], suppliers: SupplierRecord[], limit = 5) {
  const active = suppliers.filter((s) => s.status === "active");
  return rfqs
    .filter((r) => r.responses > 0)
    .slice(0, limit)
    .map((r, i) => ({
      name: active[(i * 3 + r.responses) % active.length]?.name ?? "Supplier",
      text: `Responded to ${r.title} (${r.event.name})`,
      timestamp: relativePast(r.createdAt),
    }));
}

export function computeCategoryDemand(rfqs: RfqRecord[]) {
  const counts = new Map<string, number>();
  for (const r of rfqs) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const total = rfqs.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value, sharePct: Math.round((value / total) * 100) }));
}

export { formatGBP };
