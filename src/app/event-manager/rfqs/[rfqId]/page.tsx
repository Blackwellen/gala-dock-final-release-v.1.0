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
    .select(
      "id, title, scope, category, status, due_date, response_deadline, budget_low_cents, budget_high_cents, created_at, awarded_supplier_id, event:events ( id, name )"
    )
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!rfq) notFound();

  const [{ data: recipients }, { data: award }] = await Promise.all([
    supabase
      .from("rfq_recipients")
      .select(
        "id, supplier_id, status, quote_amount_cents, notes, responded_at, created_at, supplier:suppliers ( id, name )"
      )
      .eq("rfq_id", rfqId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase
      .from("rfq_awards")
      .select("id, supplier_id, rfq_response_id, event_supplier_id, booking_committed_at")
      .eq("rfq_id", rfqId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

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
    category: rfq.category,
    status: rfq.status,
    dueDate: rfq.due_date ?? rfq.response_deadline,
    budgetLowCents: rfq.budget_low_cents,
    budgetHighCents: rfq.budget_high_cents,
    createdAt: rfq.created_at,
    eventId: ev?.id ?? null,
    eventName: ev?.name ?? null,
    award: award
      ? {
          id: award.id,
          supplierId: award.supplier_id,
          rfqResponseId: award.rfq_response_id,
          bookingCommittedAt: award.booking_committed_at,
        }
      : null,
  };

  return <RfqDetailClient rfq={detail} recipients={recipientRows} />;
}
