import { requireWorkspace } from "@/lib/workspace";
import { RfqsClient } from "./RfqsClient";
import { getRfqRecords, getSupplierRecords } from "../suppliers/_data/queries";

export const dynamic = "force-dynamic";

/**
 * Phase 3 — live Supabase data layer. RFQs, recipients and quote ranges come
 * from real workspace-scoped queries (see `suppliers/_data/queries.ts`),
 * mapped into the same `RfqRecord` shape the Phase 1 view components already
 * consume.
 */
export default async function RfqsPage() {
  const { workspaceId, user } = await requireWorkspace();
  const [rfqs, suppliers] = await Promise.all([
    getRfqRecords(workspaceId),
    getSupplierRecords(workspaceId, user.id),
  ]);
  return <RfqsClient rfqs={rfqs} suppliers={suppliers} />;
}
