import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { SuppliersClient, type SupplierRow } from "./SuppliersClient";
import { docsStatus, formatDate } from "./lib";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Suppliers + their category name and primary contact, scoped to workspace.
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select(
      `id, name, status, primary_email, last_used_at, insurance_expiry,
       category:supplier_categories ( name ),
       contacts:supplier_contacts ( name, is_primary )`
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  // File counts per supplier (non-archived) to derive document health.
  const { data: files } = await supabase
    .from("supplier_files")
    .select("supplier_id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);

  const fileCounts = new Map<string, number>();
  for (const f of files ?? []) {
    fileCounts.set(f.supplier_id, (fileCounts.get(f.supplier_id) ?? 0) + 1);
  }

  const rows: SupplierRow[] = (suppliers ?? []).map((s) => {
    const contacts = (s.contacts ?? []) as { name: string; is_primary: boolean }[];
    const primary = contacts.find((c) => c.is_primary) ?? contacts[0];
    const category = (s.category as { name: string } | null)?.name ?? "—";
    const fileCount = fileCounts.get(s.id) ?? 0;
    return {
      id: s.id,
      name: s.name,
      category,
      location: "—",
      status: s.status,
      docsStatus: docsStatus(fileCount, s.insurance_expiry),
      lastUsed: formatDate(s.last_used_at),
      contact: primary?.name ?? s.primary_email ?? "—",
    };
  });

  const now = Date.now();
  const soon = now + 1000 * 60 * 60 * 24 * 30; // 30 days
  const kpis = {
    total: rows.length,
    preferred: rows.filter((r) => r.status === "active").length,
    pending: rows.filter((r) => r.status === "paused").length,
    missingDocs: rows.filter((r) => r.docsStatus === "missing").length,
    insuranceExpiring: (suppliers ?? []).filter((s) => {
      if (!s.insurance_expiry) return false;
      const t = new Date(s.insurance_expiry).getTime();
      return !Number.isNaN(t) && t >= now && t <= soon;
    }).length,
    avgResponse: "—",
  };

  return <SuppliersClient suppliers={rows} kpis={kpis} />;
}
