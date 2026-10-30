import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { can } from "@/lib/domain/permissions";
import type { SectionProps } from "./types";
import { MerchClient, type StockRow, type MovementRow, type MerchItem, type OrderRow } from "./merch-client";

/**
 * Operations › Merch & stock (Q40 domains 253–254 + Q07 merch payments). Append-only stock movements with transfers and the
 * stock report; merch items priced against merchandise stock; the organiser's merch orders with refunds through
 * /api/merch/refund (refunds.approve — card refunds go back on the organiser's connected account) and collection by code.
 */
export async function MerchSection({ e, role }: SectionProps) {
  const sb = untyped(await createClient());
  const ws = e.workspace_id as string;
  const [{ data: report }, { data: items }, { data: merch }, { data: orders }] = await Promise.all([
    sb.rpc("stock_report", { p_workspace: ws, p_event: e.id }),
    sb.from("stock_items").select("id,name,category,sku,unit,on_hand,reserved,reorder_level,event_id,status").eq("workspace_id", ws).eq("status", "active").or(`event_id.is.null,event_id.eq.${e.id}`).order("category").order("name"),
    sb.from("merch_items").select("id,name,price_minor,vat_rate_bps,per_order_limit,status,stock_item_id,event_id").eq("workspace_id", ws).or(`event_id.is.null,event_id.eq.${e.id}`).order("name"),
    sb.from("merch_orders").select("id,order_ref,status,total_minor,refunded_minor,card_refunded_minor,currency,strategy,refund_required,created_at,paid_at,collected_at,expires_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const itemIds = ((items ?? []) as { id: string }[]).map(i => i.id);
  const orderIds = ((orders ?? []) as { id: string }[]).map(o => o.id);
  const [{ data: moves }, { data: lines }, { data: cardRefunds }] = await Promise.all([
    itemIds.length ? sb.from("stock_movements").select("id,item_id,event_id,kind,quantity,delta,on_hand_after,reason,ref,created_at").in("item_id", itemIds).order("created_at", { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
    orderIds.length ? sb.from("merch_order_lines").select("order_id,merch_item_id,qty,unit_minor,refunded_qty").in("order_id", orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? sb.from("merch_card_refunds").select("order_id,status,amount_minor,created_at").in("order_id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  const ln = (lines ?? []) as { order_id: string; merch_item_id: string; qty: number; unit_minor: number; refunded_qty: number }[];
  const cr = (cardRefunds ?? []) as { order_id: string; status: string; amount_minor: number; created_at: string }[];
  return <MerchClient eventId={e.id} merchUrl={typeof e.settings.merch_url === "string" ? e.settings.merch_url : ""}
    report={(report ?? []) as { item_id: string; issued: number; returned: number; wasted: number; sold: number; low_stock: boolean }[]}
    stock={(items ?? []) as StockRow[]} movements={(moves ?? []) as MovementRow[]} merch={(merch ?? []) as MerchItem[]}
    orders={((orders ?? []) as Omit<OrderRow, "lines" | "card_refunds">[]).map(o => ({ ...o, lines: ln.filter(l => l.order_id === o.id), card_refunds: cr.filter(c => c.order_id === o.id) }))}
    canStock={can("organizer", role, "events.write")} canMerch={can("organizer", role, "tickets.manage")} canRefund={can("organizer", role, "refunds.approve")}
    canOrders={can("organizer", role, "sales.read") || can("organizer", role, "finance.read")} />;
}
