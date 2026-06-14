import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { RfqsClient, type RfqRow, type RfqsKpis } from "./RfqsClient";

export const dynamic = "force-dynamic";

export default async function RfqsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: rfqs } = await supabase
    .from("rfqs")
    .select("id, title, status, due_date, created_at, event:events ( id, name )")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const list = rfqs ?? [];
  const rfqIds = list.map((r) => r.id);

  // Aggregate recipient counts per RFQ in a single query.
  const recipientCounts = new Map<string, { total: number; responded: number }>();
  if (rfqIds.length > 0) {
    const { data: recipients } = await supabase
      .from("rfq_recipients")
      .select("rfq_id, status")
      .eq("workspace_id", workspaceId)
      .in("rfq_id", rfqIds);
    for (const r of recipients ?? []) {
      const entry = recipientCounts.get(r.rfq_id) ?? { total: 0, responded: 0 };
      entry.total += 1;
      if (["responded", "accepted", "rejected", "declined"].includes(r.status)) {
        entry.responded += 1;
      }
      recipientCounts.set(r.rfq_id, entry);
    }
  }

  const rows: RfqRow[] = list.map((r) => {
    const counts = recipientCounts.get(r.id) ?? { total: 0, responded: 0 };
    const ev = r.event as { id: string; name: string } | null;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      dueDate: r.due_date,
      createdAt: r.created_at,
      eventName: ev?.name ?? null,
      recipientCount: counts.total,
      responseCount: counts.responded,
    };
  });

  const kpis: RfqsKpis = {
    total: rows.length,
    active: rows.filter((r) => r.status === "sent" || r.status === "responses-received").length,
    responses: rows.reduce((sum, r) => sum + r.responseCount, 0),
    awarded: rows.filter((r) => r.status === "awarded").length,
  };

  return <RfqsClient rfqs={rows} kpis={kpis} />;
}
