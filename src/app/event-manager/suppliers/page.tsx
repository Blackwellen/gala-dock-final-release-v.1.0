import { requireWorkspace } from "@/lib/workspace";
import { SuppliersClient } from "./SuppliersClient";
import { getSupplierRecords } from "./_data/queries";

export const dynamic = "force-dynamic";

/**
 * Phase 3 — live Supabase data layer. Suppliers, documents, pauses,
 * archives, stars and outreach all come from real workspace-scoped queries
 * (see `_data/queries.ts`), mapped into the same `SupplierRecord` shape the
 * Phase 1 view components already consume, so the view layer needed no
 * changes.
 */
export default async function SuppliersPage() {
  const { workspaceId, user } = await requireWorkspace();
  const suppliers = await getSupplierRecords(workspaceId, user.id);
  return <SuppliersClient suppliers={suppliers} />;
}
