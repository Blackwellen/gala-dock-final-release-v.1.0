import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { RfqDetailClient, type RfqDetail, type RecipientRow } from "./RfqDetailClient";

export const dynamic = "force-dynamic";

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ rfqId: string }>;
}) {
  const { rfqId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: rfq } = await supabase
    .from("rfqs")
    .select("id, title, scope, status, due_date, created_at, event:events ( id, name )")
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!rfq) notFound();

  const { data: recipients } = await supabase
    .from("rfq_recipients")
    .select(
      "id, supplier_id, status, quote_amount_cents, notes, responded_at, created_at, supplier:suppliers ( id, name )"
    )
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  const recipientRows: RecipientRow[] = (recipients ?? []).map((r) => {
    const supplier = r.supplier as { id: string; name: string } | null;
    return {
      id: r.id,
      supplierId: r.supplier_id,
      supplierName: supplier?.name ?? "Unknown supplier",
      status: r.status,
      quoteCents: r.quote_amount_cents,
      notes: r.notes,
      respondedAt: r.responded_at,
    };
  });

  const ev = rfq.event as { id: string; name: string } | null;
  const detail: RfqDetail = {
    id: rfq.id,
    title: rfq.title,
    scope: rfq.scope,
    status: rfq.status,
    dueDate: rfq.due_date,
    createdAt: rfq.created_at,
    eventId: ev?.id ?? null,
    eventName: ev?.name ?? null,
  };

  return <RfqDetailClient rfq={detail} recipients={recipientRows} />;
}
