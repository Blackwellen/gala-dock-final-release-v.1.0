import { requireWorkspace, canManageWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LibraryTabs } from "../_shared";
import { kindLabel, type LibraryKind } from "../library-utils";
import { effectiveStatus, daysUntil } from "./doc-utils";
import { SupplierDocsClient } from "./SupplierDocsClient";
import { SupplierDocsHeaderActions } from "./HeaderActions";
import type {
  ComplianceAlertRow,
  DocRow,
  ExpiringDocRow,
  FilterOption,
  RecentActivityRow,
  RiskLevel,
  SupplierCompletionRow,
  SupplierDocMetadata,
  SupplierDocsKpis,
  VerificationStatus,
} from "./types";

export const metadata = { title: "Supplier Documents" };

// Kinds that are always treated as supplier/compliance documents regardless
// of linkage, plus generic document/image kinds ONLY when linked to a
// supplier entity (entity_type = 'supplier').
const ALWAYS_SUPPLIER_KINDS: LibraryKind[] = ["contract", "rider", "menu", "invoice_template"];
const CONDITIONAL_SUPPLIER_KINDS: LibraryKind[] = ["document", "image"];

export default async function SupplierDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const view = viewParam === "list" ? "list" : "grid";

  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const [
    { data: assets },
    { data: suppliers },
    { data: categories },
    { data: requirements },
    { data: events },
    { data: members },
  ] = await Promise.all([
    supabase
      .from("library_assets")
      .select(
        "id, title, kind, mime, size_bytes, created_at, updated_at, storage_path, entity_type, entity_id, metadata, owner_user_id, visibility"
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("kind", [...ALWAYS_SUPPLIER_KINDS, ...CONDITIONAL_SUPPLIER_KINDS])
      .order("created_at", { ascending: false }),
    supabase
      .from("suppliers")
      .select("id, name, category_id, status")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase.from("supplier_categories").select("id, name").eq("workspace_id", workspaceId),
    supabase
      .from("supplier_document_requirements")
      .select("category_id, document_type, is_required, default_risk_level")
      .eq("workspace_id", workspaceId),
    supabase
      .from("events")
      .select("id, name, start_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(200),
    supabase.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId).is("deleted_at", null),
  ]);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } =
    memberIds.length > 0
      ? await supabase.from("profiles").select("user_id, display_name").in("user_id", memberIds)
      : { data: [] as { user_id: string; display_name: string | null }[] };

  const ownerNameById = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Workspace Member"]));
  const supplierById = new Map((suppliers ?? []).map((s) => [s.id, s]));
  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));

  const relevantAssets = (assets ?? []).filter(
    (a) => (ALWAYS_SUPPLIER_KINDS as string[]).includes(a.kind) || (a.entity_type === "supplier" && !!a.entity_id)
  );

  const now = Date.now();

  const docs: DocRow[] = relevantAssets.map((a) => {
    const md = (a.metadata as SupplierDocMetadata | null) ?? {};
    const supplier = a.entity_type === "supplier" && a.entity_id ? (supplierById.get(a.entity_id) ?? null) : null;
    const categoryName =
      md.category ?? (supplier?.category_id ? (categoryNameById.get(supplier.category_id) ?? "Uncategorised") : "Company Wide");
    const relatedEvent = md.relatedEventId ? (eventById.get(md.relatedEventId) ?? null) : null;
    const stored: VerificationStatus = md.verificationStatus ?? "pending_review";
    const status = effectiveStatus(stored, md.expiryDate ?? null, now);

    return {
      id: a.id,
      isSynthetic: false,
      title: a.title,
      kind: a.kind,
      documentType: md.documentType ?? kindLabel(a.kind),
      mime: a.mime,
      sizeBytes: a.size_bytes,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      storagePath: a.storage_path,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? null,
      category: categoryName,
      expiryDate: md.expiryDate ?? null,
      relatedEventId: md.relatedEventId ?? null,
      relatedEventName: relatedEvent?.name ?? null,
      riskLevel: md.riskLevel ?? null,
      ownerUserId: a.owner_user_id,
      ownerName: a.owner_user_id ? (ownerNameById.get(a.owner_user_id) ?? "Workspace Member") : "Unassigned",
      visibility: a.visibility,
      status,
      verifiedBy: md.verifiedBy ? (ownerNameById.get(md.verifiedBy) ?? null) : null,
      verifiedAt: md.verifiedAt ?? null,
      rejectedBy: md.rejectedBy ? (ownerNameById.get(md.rejectedBy) ?? null) : null,
      rejectedAt: md.rejectedAt ?? null,
      rejectionReason: md.rejectionReason ?? null,
    };
  });

  // ── Synthesize "missing" rows: required document types (per supplier
  // category, from supplier_document_requirements) with no matching linked
  // library_assets document for that supplier. This is the only way to
  // surface true compliance gaps without a new migration linking the two
  // systems directly by supplier_id + document_type.
  const requirementsByCategory = new Map<string, { document_type: string; default_risk_level: string }[]>();
  for (const r of requirements ?? []) {
    if (!r.is_required || !r.category_id) continue;
    const list = requirementsByCategory.get(r.category_id) ?? [];
    list.push({ document_type: r.document_type, default_risk_level: r.default_risk_level });
    requirementsByCategory.set(r.category_id, list);
  }

  const docsBySupplier = new Map<string, DocRow[]>();
  for (const d of docs) {
    if (!d.supplierId) continue;
    const list = docsBySupplier.get(d.supplierId) ?? [];
    list.push(d);
    docsBySupplier.set(d.supplierId, list);
  }

  const missingRows: DocRow[] = [];
  for (const supplier of suppliers ?? []) {
    if (!supplier.category_id) continue;
    const reqs = requirementsByCategory.get(supplier.category_id) ?? [];
    if (reqs.length === 0) continue;
    const supplierDocs = docsBySupplier.get(supplier.id) ?? [];
    for (const req of reqs) {
      const fulfilled = supplierDocs.some(
        (d) => d.documentType.trim().toLowerCase() === req.document_type.trim().toLowerCase() && d.status !== "missing"
      );
      if (fulfilled) continue;
      missingRows.push({
        id: `missing-${supplier.id}-${req.document_type}`,
        isSynthetic: true,
        title: req.document_type,
        kind: "document",
        documentType: req.document_type,
        mime: null,
        sizeBytes: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        storagePath: null,
        supplierId: supplier.id,
        supplierName: supplier.name,
        category: categoryNameById.get(supplier.category_id) ?? "Uncategorised",
        expiryDate: null,
        relatedEventId: null,
        relatedEventName: null,
        riskLevel: (req.default_risk_level as RiskLevel) ?? null,
        ownerUserId: null,
        ownerName: "—",
        visibility: "workspace",
        status: "missing",
      });
    }
  }

  const allRows = [...docs, ...missingRows];

  // ── KPIs ──────────────────────────────────────────────────────────────
  const kpis: SupplierDocsKpis = {
    total: docs.length,
    verified: docs.filter((d) => d.status === "verified").length,
    expiringSoon: docs.filter((d) => d.status === "expiring_soon").length,
    pendingReview: docs.filter((d) => d.status === "pending_review").length,
    missing: missingRows.length + docs.filter((d) => d.status === "missing").length,
    rejected: docs.filter((d) => d.status === "rejected").length,
  };

  // ── Right rail: expiring documents ──────────────────────────────────────
  const expiringDocuments: ExpiringDocRow[] = docs
    .filter((d) => d.expiryDate && (d.status === "expiring_soon" || d.status === "expired"))
    .map((d) => ({
      id: d.id,
      title: d.title,
      supplierName: d.supplierName,
      expiryDate: d.expiryDate as string,
      daysUntil: daysUntil(d.expiryDate as string, now),
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 6);

  // ── Right rail: compliance alerts ───────────────────────────────────────
  const complianceAlerts: ComplianceAlertRow[] = [
    { label: "Missing required documents", value: kpis.missing },
    { label: "Expired documents", value: docs.filter((d) => d.status === "expired").length },
    { label: "Pending review", value: kpis.pendingReview },
    { label: "Rejected", value: kpis.rejected },
  ].filter((a) => a.value > 0);

  // ── Right rail: supplier document completion ────────────────────────────
  const supplierCompletion: SupplierCompletionRow[] = (suppliers ?? [])
    .map((s): SupplierCompletionRow | null => {
      if (!s.category_id) return null;
      const reqs = requirementsByCategory.get(s.category_id) ?? [];
      if (reqs.length === 0) return null;
      const supplierDocs = docsBySupplier.get(s.id) ?? [];
      const fulfilled = reqs.filter((req) =>
        supplierDocs.some(
          (d) =>
            d.documentType.trim().toLowerCase() === req.document_type.trim().toLowerCase() &&
            (d.status === "verified" || d.status === "expiring_soon")
        )
      ).length;
      return {
        supplierId: s.id,
        supplierName: s.name,
        required: reqs.length,
        fulfilled,
        completionPct: Math.round((fulfilled / reqs.length) * 100),
      };
    })
    .filter((r): r is SupplierCompletionRow => r !== null)
    .sort((a, b) => a.completionPct - b.completionPct)
    .slice(0, 6);

  // ── Right rail: recent compliance activity (derived from real verify/reject metadata) ──
  const recentActivity: RecentActivityRow[] = docs
    .filter((d) => d.verifiedAt || d.rejectedAt)
    .map((d): RecentActivityRow => {
      const isRejected = !!d.rejectedAt && (!d.verifiedAt || d.rejectedAt > d.verifiedAt);
      return {
        id: d.id,
        title: d.title,
        supplierName: d.supplierName,
        action: isRejected ? "rejected" : "verified",
        actorName: (isRejected ? d.rejectedBy : d.verifiedBy) ?? "Workspace Member",
        at: (isRejected ? d.rejectedAt : d.verifiedAt) as string,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  // ── Filter option lists ──────────────────────────────────────────────────
  const supplierOptions: FilterOption[] = (suppliers ?? []).map((s) => ({ value: s.id, label: s.name }));
  const documentTypeOptions: FilterOption[] = Array.from(new Set(allRows.map((d) => d.documentType)))
    .sort()
    .map((v) => ({ value: v, label: v }));
  const categoryOptions: FilterOption[] = Array.from(new Set(allRows.map((d) => d.category)))
    .sort()
    .map((v) => ({ value: v, label: v }));
  const eventOptions: FilterOption[] = (events ?? []).map((e) => ({ value: e.id, label: e.name }));
  const ownerOptions: FilterOption[] = Array.from(new Set(docs.map((d) => d.ownerName)))
    .sort()
    .map((v) => ({ value: v, label: v }));

  const canManage = await canManageWorkspace();

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Supplier Documents"
        description="Track supplier contracts, menus, quotes, insurance, RAMS, licences, compliance files and onboarding paperwork."
        tabs={<LibraryTabs active="supplier-docs" basePath="/event-manager/library" />}
        actions={
          <SupplierDocsHeaderActions
            workspaceId={workspaceId}
            supplierOptions={supplierOptions}
            documentTypeOptions={documentTypeOptions}
            eventOptions={eventOptions}
          />
        }
      />
      <SupplierDocsClient
        rows={allRows}
        kpis={kpis}
        expiringDocuments={expiringDocuments}
        complianceAlerts={complianceAlerts}
        supplierCompletion={supplierCompletion}
        recentActivity={recentActivity}
        supplierOptions={supplierOptions}
        documentTypeOptions={documentTypeOptions}
        categoryOptions={categoryOptions}
        eventOptions={eventOptions}
        ownerOptions={ownerOptions}
        canManage={canManage}
        workspaceId={workspaceId}
        currentUserId={user.id}
        view={view}
      />
    </div>
  );
}
