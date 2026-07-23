// Server-only module (uses the server Supabase client) — import only from
// Server Components / server actions, never from a "use client" file.
import { createClient } from "@/lib/supabase/server";
import type {
  MissingDocumentEntry,
  OutreachStatus,
  RfqRecord,
  RfqStatus,
  RiskLevel,
  SupplierArchiveInfo,
  SupplierDocuments,
  SupplierPauseInfo,
  SupplierRecord,
  SupplierStatus,
  SupplierTier,
} from "./types";
import { archiveReasonLabel, pauseReasonLabel } from "./reasons";

/**
 * Live Supabase data layer for the Suppliers / RFQs section (Phase 3).
 *
 * Every function here is workspace-scoped (RLS is the backstop, but we also
 * filter explicitly per this codebase's convention — see `suppliers/page.tsx`
 * pre-Phase-3 and `brief/actions.ts`). Output is mapped into the exact
 * `SupplierRecord` / `RfqRecord` shapes from `_data/types.ts` so the Phase 1
 * view components (`_views/*.tsx`, `_components/*.tsx`) and the KPI/insight
 * math in `_data/kpis.ts` work unchanged.
 *
 * A few fields have no first-class DB column (response trend history,
 * performance score) — those are derived with a documented, deterministic
 * simplification rather than faked. See inline notes.
 */

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function daysBetween(fromIso: string | null, toMs: number): number | null {
  if (!fromIso) return null;
  const t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - toMs) / (1000 * 60 * 60 * 24));
}

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return h;
}

function initialsFor(name: string): string {
  const words = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "S";
  const second = words[1]?.[0] ?? words[0]?.[1] ?? "U";
  return (first + second).toUpperCase();
}

const LOGO_COLORS = [
  "bg-brand-500",
  "bg-violet-500",
  "bg-info-500",
  "bg-success-500",
  "bg-warning-500",
  "bg-danger-500",
  "bg-brand-700",
  "bg-violet-700",
];

function logoColorFor(name: string): string {
  return LOGO_COLORS[nameHash(name) % LOGO_COLORS.length];
}

const OUTREACH_STATUS_MAP: Record<string, OutreachStatus> = {
  not_contacted: "not-contacted",
  request_sent: "chaser-sent",
  reminder_sent: "chaser-sent",
  email_opened: "awaiting-response",
  awaiting_response: "awaiting-response",
  under_review: "awaiting-response",
  supplier_responded: "responded",
  complete: "responded",
  escalated: "escalated",
};

/** Non-response recipient states — anything else counts as a real response for response-rate math. */
const NON_RESPONSE_RECIPIENT_STATUSES = new Set(["pending", "invited", "viewed"]);

/** Non-live event-supplier states — excluded from "upcoming"/"spend" counts. */
const INACTIVE_EVENT_SUPPLIER_STATUSES = new Set(["declined", "cancelled"]);

export async function getSupplierRecords(workspaceId: string, userId: string): Promise<SupplierRecord[]> {
  const supabase = await createClient();

  const [
    { data: suppliers },
    { data: contacts },
    { data: files },
    { data: requirements },
    { data: pauses },
    { data: archives },
    { data: stars },
    { data: outreach },
    { data: recipients },
    { data: eventLinks },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id, name, status, category_id, tier, coverage_regions, primary_email, primary_phone, rating_internal, insurance_expiry, last_used_at, notes, onboarding_completed_at, category:supplier_categories ( id, name )"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("supplier_contacts")
      .select("supplier_id, name, email, phone, is_primary")
      .eq("workspace_id", workspaceId),
    supabase
      .from("supplier_files")
      .select("supplier_id, document_type, review_status, due_date")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
    supabase
      .from("supplier_document_requirements")
      .select("category_id, document_type, is_required, default_risk_level")
      .eq("workspace_id", workspaceId),
    supabase
      .from("supplier_pauses")
      .select("supplier_id, reason, reason_detail, note, paused_at")
      .eq("workspace_id", workspaceId)
      .is("reactivated_at", null),
    supabase
      .from("supplier_archives")
      .select("supplier_id, reason, reason_detail, archived_at, archived_by, can_be_restored, retention_until")
      .eq("workspace_id", workspaceId)
      .is("restored_at", null),
    supabase
      .from("supplier_stars")
      .select("supplier_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId),
    supabase
      .from("supplier_compliance_outreach")
      .select("supplier_id, status, sent_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("rfq_recipients")
      .select("supplier_id, status")
      .eq("workspace_id", workspaceId),
    supabase
      .from("event_suppliers")
      .select(
        "supplier_id, status, contract_value_cents, created_at, event:events ( id, name, start_at, location, event_type )"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
  ]);

  const now = new Date();
  const nowMs = now.getTime();

  // Resolve display names + roles for whoever archived a supplier (used in
  // SupplierArchiveInfo.archivedBy). Batched into one query rather than N+1.
  const archiverIds = [...new Set((archives ?? []).map((a) => a.archived_by).filter((v): v is string => !!v))];
  let archiverInfo = new Map<string, { name: string; role: string }>();
  if (archiverIds.length > 0) {
    const [{ data: profiles }, { data: members }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").in("user_id", archiverIds),
      supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspaceId)
        .in("user_id", archiverIds),
    ]);
    const roleByUser = new Map((members ?? []).map((m) => [m.user_id, m.role]));
    archiverInfo = new Map(
      (profiles ?? []).map((p) => [
        p.user_id,
        { name: p.display_name ?? "Workspace Member", role: roleByUser.get(p.user_id) ?? "member" },
      ])
    );
  }

  const contactsBySupplier = groupBy(contacts ?? [], (c) => c.supplier_id);
  const filesBySupplier = groupBy(files ?? [], (f) => f.supplier_id);
  const requirementsByCategory = groupBy(requirements ?? [], (r) => r.category_id ?? "__none__");
  const pauseBySupplier = new Map((pauses ?? []).map((p) => [p.supplier_id, p]));
  const archiveBySupplier = new Map((archives ?? []).map((a) => [a.supplier_id, a]));
  const starredSet = new Set((stars ?? []).map((s) => s.supplier_id));
  const outreachBySupplier = groupBy(outreach ?? [], (o) => o.supplier_id); // already ordered desc
  const recipientsBySupplier = groupBy(recipients ?? [], (r) => r.supplier_id);
  const eventLinksBySupplier = groupBy(eventLinks ?? [], (e) => e.supplier_id);

  return (suppliers ?? []).map((s): SupplierRecord => {
    const category = (s.category as { id: string; name: string } | null) ?? null;
    const categoryName = category?.name ?? "Uncategorised";

    const supplierContacts = contactsBySupplier.get(s.id) ?? [];
    const primary = supplierContacts.find((c) => c.is_primary) ?? supplierContacts[0] ?? null;
    const primaryContact = {
      name: primary?.name ?? "No contact on file",
      email: primary?.email ?? s.primary_email ?? "—",
      phone: primary?.phone ?? s.primary_phone ?? "—",
    };

    const supplierFiles = filesBySupplier.get(s.id) ?? [];
    const approvedTypes = new Set(
      supplierFiles
        .filter((f) => f.review_status === "approved" && (!f.due_date || new Date(f.due_date).getTime() > nowMs))
        .map((f) => f.document_type)
    );
    const reqs = requirementsByCategory.get(category?.id ?? "__none__") ?? [];
    const requiredReqs = reqs.filter((r) => r.is_required);
    const missingReqs = requiredReqs.filter((r) => !approvedTypes.has(r.document_type));
    const documents: SupplierDocuments = {
      required: requiredReqs.length,
      approved: requiredReqs.length - missingReqs.length,
      missingTypes: missingReqs.map((r) => r.document_type),
    };
    const missingDocuments: MissingDocumentEntry[] = missingReqs.map((r) => {
      const relatedFile = supplierFiles.find((f) => f.document_type === r.document_type);
      const dueDate = relatedFile?.due_date ?? "";
      const overdue = dueDate !== "" && new Date(dueDate).getTime() < nowMs;
      return { type: r.document_type, dueDate, overdue };
    });
    const riskLevel: RiskLevel = missingReqs.some((r) => r.default_risk_level === "critical" || r.default_risk_level === "high")
      ? "high"
      : missingReqs.some((r) => r.default_risk_level === "medium")
        ? "medium"
        : "low";
    const complianceScore = requiredReqs.length === 0 ? 100 : Math.round((documents.approved / requiredReqs.length) * 100);

    const supplierOutreach = outreachBySupplier.get(s.id) ?? [];
    const latestOutreach = supplierOutreach[0] ?? null;
    const outreachStatus: OutreachStatus =
      documents.missingTypes.length === 0
        ? "responded"
        : latestOutreach
          ? (OUTREACH_STATUS_MAP[latestOutreach.status] ?? "not-contacted")
          : "not-contacted";
    const lastContactAt = latestOutreach?.sent_at ?? latestOutreach?.created_at ?? null;

    const isStarred = starredSet.has(s.id);
    const lastUsedDaysAgo = daysBetween(s.last_used_at, nowMs);
    const withinRecentWindow = lastUsedDaysAgo !== null && lastUsedDaysAgo >= -90 && lastUsedDaysAgo <= 0;
    const recentlyUsedAt = s.status === "active" && (isStarred || withinRecentWindow) ? s.last_used_at : null;

    const supplierRecipients = recipientsBySupplier.get(s.id) ?? [];
    const invitedCount = supplierRecipients.length;
    const respondedCount = supplierRecipients.filter((r) => !NON_RESPONSE_RECIPIENT_STATUSES.has(r.status)).length;
    const responseRatePct = invitedCount > 0 ? Math.round((respondedCount / invitedCount) * 100) : 0;
    // No response-history table exists yet — the sparkline shows a flat trend
    // at the current rate rather than fabricating a fake time series.
    const responseTrend = Array.from({ length: 8 }, () => responseRatePct);

    const links = (eventLinksBySupplier.get(s.id) ?? []).filter((l) => !INACTIVE_EVENT_SUPPLIER_STATUSES.has(l.status));
    const linksWithEvent = links
      .map((l) => ({ link: l, event: l.event as { id: string; name: string; start_at: string | null; location: string | null; event_type: string | null } | null }))
      .filter((x): x is { link: (typeof links)[number]; event: NonNullable<(typeof x)["event"]> } => x.event !== null);

    const upcoming = linksWithEvent.filter((x) => x.event.start_at && new Date(x.event.start_at).getTime() > nowMs);
    upcoming.sort((a, b) => new Date(a.event.start_at as string).getTime() - new Date(b.event.start_at as string).getTime());
    const upcomingBookingsCount = upcoming.length;
    const nextBookingDate = upcoming[0]?.event.start_at ?? null;

    const past = linksWithEvent
      .filter((x) => x.event.start_at && new Date(x.event.start_at).getTime() <= nowMs)
      .sort((a, b) => new Date(b.event.start_at as string).getTime() - new Date(a.event.start_at as string).getTime());
    const recentSpend90d = past
      .filter((x) => (daysBetween(x.event.start_at, nowMs) ?? -999) >= -90)
      .reduce((sum, x) => sum + (x.link.contract_value_cents ?? 0) / 100, 0);

    const lastEventUsed = past[0]
      ? {
          name: past[0].event.name,
          location: past[0].event.location ?? s.coverage_regions[0] ?? "—",
          date: past[0].event.start_at ?? "",
          category: categoryName,
        }
      : null;
    const lastBookedDate = s.last_used_at ?? past[0]?.event.start_at ?? null;

    const eventCategories = [...new Set(linksWithEvent.map((x) => x.event.event_type).filter((v): v is string => !!v))];
    if (eventCategories.length === 0) eventCategories.push(categoryName);

    const rating = Math.min(5, Math.max(0, s.rating_internal ?? 4));
    // No dedicated performance-score column — derived deterministically from
    // internal rating (0-5 -> 0-100) rather than fabricated.
    const performanceScore = Math.round((rating / 5) * 100);
    const performanceLabel: SupplierRecord["performanceLabel"] =
      performanceScore >= 90 ? "Excellent" : performanceScore >= 78 ? "Very Good" : performanceScore >= 65 ? "Good" : "Fair";

    const atRiskContractValue =
      documents.missingTypes.length > 0
        ? upcoming.reduce((sum, x) => sum + (x.link.contract_value_cents ?? 0) / 100, 0)
        : 0;

    let pause: SupplierPauseInfo | null = null;
    const pauseRow = pauseBySupplier.get(s.id);
    if (pauseRow) {
      pause = {
        reason: pauseReasonLabel(pauseRow.reason),
        reasonDetail: pauseRow.reason_detail ?? "",
        pausedAt: pauseRow.paused_at,
        notes: pauseRow.note ?? "",
      };
    }

    let archive: SupplierArchiveInfo | null = null;
    const archiveRow = archiveBySupplier.get(s.id);
    if (archiveRow) {
      const archiver = archiveRow.archived_by ? archiverInfo.get(archiveRow.archived_by) : undefined;
      archive = {
        reason: archiveReasonLabel(archiveRow.reason),
        reasonDetail: archiveRow.reason_detail ?? "",
        archivedAt: archiveRow.archived_at,
        archivedBy: archiver ?? { name: "Workspace Member", role: "member" },
        canBeRestored: archiveRow.can_be_restored,
        retentionUntil: archiveRow.retention_until ?? "",
        lastActivityAt: s.last_used_at ?? archiveRow.archived_at,
      };
    }

    return {
      id: s.id,
      name: s.name,
      logoInitials: initialsFor(s.name),
      logoColor: logoColorFor(s.name),
      rating,
      tier: (s.tier as SupplierTier) ?? null,
      primaryContact,
      category: categoryName,
      coverageRegions: s.coverage_regions.length > 0 ? s.coverage_regions : ["Not set"],
      status: s.status as SupplierStatus,
      onboardingPct: s.onboarding_completed_at ? 100 : 55,
      documents,
      insuranceExpiryDate: s.insurance_expiry,
      responseRatePct,
      responseTrend,
      isStarred,
      lastBookedDate,
      recentlyUsedAt,
      pause,
      archive,
      complianceScore,
      riskLevel,
      missingDocuments,
      outreachStatus,
      lastContactAt,
      upcomingBookingsCount,
      nextBookingDate,
      recentSpend90d,
      performanceScore,
      performanceLabel,
      eventCategories,
      lastEventUsed,
      atRiskContractValue,
    };
  });
}

/* ─── RFQs ────────────────────────────────────────────────────────────── */

const RFQ_STATUS_VALUES: RfqStatus[] = ["draft", "sent", "responses-received", "under-review", "awarded", "closed"];

/**
 * `rfqs.status` is a free-text column (see migration notes) and has been
 * written by two different code paths in this codebase — the legacy
 * hyphenated vocabulary in `rfqs/actions.ts` (draft/sent/responses-received/
 * awarded/closed) and the underscored vocabulary used by the Phase 2 demo
 * seed (responses_received/under_review/cancelled). Normalise both onto the
 * `RfqStatus` union the UI understands.
 */
function normalizeRfqStatus(raw: string): RfqStatus {
  const hyphenated = raw.replace(/_/g, "-");
  if ((RFQ_STATUS_VALUES as readonly string[]).includes(hyphenated)) return hyphenated as RfqStatus;
  if (hyphenated === "cancelled" || hyphenated === "canceled") return "closed";
  return "draft";
}

export async function getRfqRecords(workspaceId: string): Promise<RfqRecord[]> {
  const supabase = await createClient();

  const [{ data: rfqs }, { data: recipients }] = await Promise.all([
    supabase
      .from("rfqs")
      .select(
        "id, title, category, status, due_date, response_deadline, budget_low_cents, budget_high_cents, awarded_supplier_id, awarded_at, created_at, event:events ( id, name, start_at, location ), awarded_supplier:suppliers ( name )"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("rfq_recipients").select("rfq_id, status, quote_amount_cents").eq("workspace_id", workspaceId),
  ]);

  const recipientsByRfq = groupBy(recipients ?? [], (r) => r.rfq_id);
  const rfqList = rfqs ?? [];

  return rfqList.map((r, i): RfqRecord => {
    const event = r.event as { id: string; name: string; start_at: string | null; location: string | null } | null;
    const awardedSupplier = r.awarded_supplier as { name: string } | null;
    const rfqRecipients = recipientsByRfq.get(r.id) ?? [];
    const suppliersInvited = rfqRecipients.length;
    const responses = rfqRecipients.filter((rec) => !NON_RESPONSE_RECIPIENT_STATUSES.has(rec.status)).length;

    const quotedAmounts = rfqRecipients.map((rec) => rec.quote_amount_cents).filter((v): v is number => v !== null);
    const quoteRangeLow = quotedAmounts.length > 0 ? Math.min(...quotedAmounts) / 100 : (r.budget_low_cents ?? 0) / 100;
    const quoteRangeHigh = quotedAmounts.length > 0 ? Math.max(...quotedAmounts) / 100 : (r.budget_high_cents ?? 0) / 100;

    const status = normalizeRfqStatus(r.status);
    const year = new Date(r.created_at).getFullYear();

    return {
      id: r.id,
      code: `RFQ-${year}-${String(rfqList.length - i).padStart(3, "0")}`,
      title: r.title,
      event: {
        name: event?.name ?? "No linked event",
        date: event?.start_at ?? r.response_deadline ?? r.due_date ?? "",
        location: event?.location ?? "—",
      },
      category: r.category ?? "General",
      suppliersInvited,
      responses,
      quoteRangeLow,
      quoteRangeHigh,
      dueDate: r.due_date ?? r.response_deadline ?? "",
      status,
      awardedSupplierName: status === "awarded" ? (awardedSupplier?.name ?? null) : null,
      createdAt: r.created_at,
    };
  });
}
