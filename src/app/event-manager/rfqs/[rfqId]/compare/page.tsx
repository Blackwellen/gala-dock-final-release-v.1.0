import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { CompareClient, type ComparisonResponse } from "./CompareClient";

export const dynamic = "force-dynamic";

export default async function RfqComparePage({
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
      "id, title, status, awarded_supplier_id, event:events ( id, name, guest_count_day, guest_count_evening )"
    )
    .eq("id", rfqId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!rfq) notFound();

  const { data: responses } = await supabase
    .from("rfq_responses")
    .select(
      "id, supplier_id, version, status, total_amount_cents, lead_time_days, valid_until, exclusions, assumptions, notes, submitted_at, supplier:suppliers ( id, name, rating_internal, tier )"
    )
    .eq("rfq_id", rfqId)
    .eq("workspace_id", workspaceId)
    .eq("status", "submitted")
    .order("version", { ascending: false });

  // Keep only the latest (highest-version) submitted response per supplier.
  const latestBySupplier = new Map<string, NonNullable<typeof responses>[number]>();
  for (const r of responses ?? []) {
    if (!latestBySupplier.has(r.supplier_id)) latestBySupplier.set(r.supplier_id, r);
  }
  const latestResponses = [...latestBySupplier.values()];
  const responseIds = latestResponses.map((r) => r.id);

  const { data: lineItems } =
    responseIds.length > 0
      ? await supabase
          .from("rfq_response_line_items")
          .select("id, rfq_response_id, description, quantity, unit_price_cents, sort_order")
          .in("rfq_response_id", responseIds)
          .order("sort_order", { ascending: true })
      : { data: [] as never[] };

  const lineItemsByResponse = new Map<string, { description: string; quantity: number; unitPriceCents: number }[]>();
  for (const li of lineItems ?? []) {
    const list = lineItemsByResponse.get(li.rfq_response_id) ?? [];
    list.push({ description: li.description, quantity: li.quantity, unitPriceCents: li.unit_price_cents });
    lineItemsByResponse.set(li.rfq_response_id, list);
  }

  const event = rfq.event as
    | { id: string; name: string; guest_count_day: number; guest_count_evening: number }
    | null;
  const guestCount = event ? Math.max(event.guest_count_day, event.guest_count_evening) : 0;

  const comparisonResponses: ComparisonResponse[] = latestResponses.map((r) => {
    const supplier = r.supplier as { id: string; name: string; rating_internal: number | null; tier: string | null } | null;
    return {
      id: r.id,
      supplierId: r.supplier_id,
      supplierName: supplier?.name ?? "Unknown supplier",
      supplierRating: supplier?.rating_internal ?? null,
      supplierTier: supplier?.tier ?? null,
      version: r.version,
      totalAmountCents: r.total_amount_cents,
      leadTimeDays: r.lead_time_days,
      validUntil: r.valid_until,
      exclusions: r.exclusions,
      assumptions: r.assumptions,
      notes: r.notes,
      submittedAt: r.submitted_at,
      lineItems: lineItemsByResponse.get(r.id) ?? [],
    };
  });

  return (
    <CompareClient
      rfqId={rfq.id}
      rfqTitle={rfq.title}
      isAwarded={rfq.status === "awarded"}
      awardedSupplierId={rfq.awarded_supplier_id}
      guestCount={guestCount}
      responses={comparisonResponses}
    />
  );
}
