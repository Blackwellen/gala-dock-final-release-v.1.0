import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  SupplierManageClient,
  type ManageSupplier,
  type RateCardRow,
  type BlockedDateRow,
  type RatingRow,
  type ContractRow,
  type EventOption,
} from "./SupplierManageClient";

export const dynamic = "force-dynamic";

export default async function SupplierManagePage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name, status, category:supplier_categories ( name )")
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!supplier) notFound();

  const [
    { data: rateCards },
    { data: blockedDates },
    { data: ratings },
    { data: contracts },
    { data: events },
  ] = await Promise.all([
    supabase
      .from("supplier_rate_cards")
      .select("id, item_name, unit, unit_price_cents, currency, notes, sort_order")
      .eq("supplier_id", supplierId)
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true })
      .order("item_name", { ascending: true }),
    supabase
      .from("supplier_blocked_dates")
      .select("id, blocked_date, reason")
      .eq("supplier_id", supplierId)
      .eq("workspace_id", workspaceId)
      .order("blocked_date", { ascending: true }),
    supabase
      .from("supplier_ratings")
      .select("id, rating, review, event_id, created_at, event:events ( id, name )")
      .eq("supplier_id", supplierId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_contracts")
      .select(
        "id, title, status, storage_key, value_cents, signed_at, expires_at, created_at, event:events ( id, name )"
      )
      .eq("supplier_id", supplierId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(100),
  ]);

  const detail: ManageSupplier = {
    id: supplier.id,
    name: supplier.name,
    status: supplier.status,
    category: (supplier.category as { name: string } | null)?.name ?? null,
  };

  const rateCardRows: RateCardRow[] = (rateCards ?? []).map((r) => ({
    id: r.id,
    itemName: r.item_name,
    unit: r.unit,
    unitPriceCents: r.unit_price_cents,
    currency: r.currency,
    notes: r.notes,
  }));

  const blockedDateRows: BlockedDateRow[] = (blockedDates ?? []).map((b) => ({
    id: b.id,
    date: b.blocked_date,
    reason: b.reason,
  }));

  const ratingRows: RatingRow[] = (ratings ?? []).map((r) => {
    const ev = r.event as { id: string; name: string } | null;
    return {
      id: r.id,
      rating: r.rating,
      review: r.review,
      eventName: ev?.name ?? null,
      createdAt: r.created_at,
    };
  });

  const contractRows: ContractRow[] = (contracts ?? []).map((c) => {
    const ev = c.event as { id: string; name: string } | null;
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      hasFile: c.storage_key !== null,
      valueCents: c.value_cents,
      signedAt: c.signed_at,
      expiresAt: c.expires_at,
      eventName: ev?.name ?? null,
    };
  });

  const eventOptions: EventOption[] = (events ?? []).map((e) => ({
    id: e.id,
    name: e.name,
  }));

  return (
    <SupplierManageClient
      supplier={detail}
      rateCards={rateCardRows}
      blockedDates={blockedDateRows}
      ratings={ratingRows}
      contracts={contractRows}
      events={eventOptions}
    />
  );
}
