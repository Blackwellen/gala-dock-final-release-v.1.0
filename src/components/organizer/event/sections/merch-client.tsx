"use client";
import { useState } from "react";
import { Package, ArrowLeftRight, Plus, ShoppingBag, RotateCcw, ScanLine, AlertTriangle, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Chip, Empty, Btn, Stat } from "@/components/kit";
import { Dialog, useAction, useKitToast } from "@/components/kit/client";
import { money, num, dateShort, time } from "@/lib/format";
import { saveMerchUrl } from "@/lib/actions/merch-link";
import { createStockItem, moveStock, transferStockBetween, createMerchItem, setMerchStatus, collectMerchOrder } from "@/lib/actions/composition-ui";

export type StockRow = { id: string; name: string; category: string; sku: string | null; unit: string; on_hand: number; reserved: number; reorder_level: number | null; event_id: string | null; status: string };
export type MovementRow = { id: number; item_id: string; event_id: string | null; kind: string; quantity: number; delta: number; on_hand_after: number | null; reason: string | null; ref: string | null; created_at: string };
export type MerchItem = { id: string; name: string; price_minor: number; vat_rate_bps: number; per_order_limit: number; status: string; stock_item_id: string; event_id: string | null };
export type OrderRow = { id: string; order_ref: string; status: string; total_minor: number; refunded_minor: number; card_refunded_minor: number; currency: string; strategy: string; refund_required: boolean; created_at: string; paid_at: string | null; collected_at: string | null; expires_at: string;
  lines: { merch_item_id: string; qty: number; unit_minor: number; refunded_qty: number }[]; card_refunds: { status: string; amount_minor: number; created_at: string }[] };

const CATS: [string, string][] = [["merchandise", "Merchandise"], ["bar_stock", "Bar stock"], ["consumable", "Consumables"], ["equipment", "Equipment"], ["furniture", "Furniture"]];
const MOVES: [string, string][] = [["receive", "Receive (delivery in)"], ["issue", "Issue (out to use)"], ["return", "Return (back in)"], ["waste", "Waste / damaged"], ["count", "Stock count (set on hand)"], ["adjust", "Adjust (+/−)"]];
const OST: Record<string, [string, "gray" | "blue" | "green" | "amber" | "red"]> = { pending: ["Reserved, unpaid", "gray"], paid: ["Paid", "blue"], collected: ["Collected", "green"], partially_refunded: ["Part refunded", "amber"], refunded: ["Refunded", "red"], cancelled: ["Cancelled", "gray"], expired: ["Expired", "gray"] };
const MST: Record<string, [string, "gray" | "green" | "amber"]> = { draft: ["Draft", "gray"], on_sale: ["On sale", "green"], off_sale: ["Off sale", "amber"] };
const REASONS: [string, string][] = [["customer_cancelled", "Customer request"], ["event_cancelled", "Event cancelled"], ["partial_service_failure", "Item faulty / not supplied"], ["duplicate", "Duplicate order"], ["goodwill", "Goodwill"]];
const gbp = (m: number) => money(m / 100);
const rid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

export function MerchClient(p: { eventId: string; merchUrl?: string; report: { item_id: string; issued: number; returned: number; wasted: number; sold: number; low_stock: boolean }[]; stock: StockRow[]; movements: MovementRow[]; merch: MerchItem[]; orders: OrderRow[];
  canStock: boolean; canMerch: boolean; canRefund: boolean; canOrders: boolean }) {
  const [tab, setTab] = useState<"stock" | "merch" | "orders">("stock");
  const paid = p.orders.filter(o => ["paid", "collected", "partially_refunded"].includes(o.status));
  return <div className="oc">
    <div className="oc-kpis">
      <Stat label="Stock lines" value={num(p.stock.length)} sub={`${p.report.filter(r => r.low_stock).length} at or below reorder level`} tone={p.report.some(r => r.low_stock) ? "amber" : undefined} />
      <Stat label="Merch items on sale" value={num(p.merch.filter(m => m.status === "on_sale").length)} sub={`${p.merch.length} in total`} />
      <Stat label="Paid orders" value={num(paid.length)} sub={`${p.orders.filter(o => o.status === "collected").length} collected`} />
      <Stat label="Merch revenue" value={gbp(paid.reduce((a, o) => a + o.total_minor - o.refunded_minor, 0))} tone="green" sub="after refunds" />
    </div>
    <div className="k-seg oc-tabs" role="tablist" aria-label="Merch and stock">{([["stock", "Stock", Package], ["merch", "Merch items", ShoppingBag], ["orders", "Orders & collection", ScanLine]] as const).map(([k, l, I]) =>
      <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><I size={14} aria-hidden />{l}</button>)}</div>
    {tab === "stock" && <StockPanel {...p} />}
    {tab === "merch" && <><MerchLinkCard eventId={p.eventId} initial={p.merchUrl ?? ""} canEdit={p.canMerch} /><MerchPanel {...p} /></>}
    {tab === "orders" && <OrdersPanel {...p} />}
  </div>;
}

function StockPanel({ eventId, report, stock, movements, canStock }: Parameters<typeof MerchClient>[0]) {
  const { run, pending } = useAction();
  const [add, setAdd] = useState(false); const [n, setN] = useState({ name: "", category: "merchandise", sku: "", unit: "each", reorder: "", eventOnly: true });
  const [mv, setMv] = useState<{ item: StockRow; kind: string; qty: string; reason: string; rid: string } | null>(null);
  const [tr, setTr] = useState<{ from: string; to: string; qty: string; reason: string } | null>(null);
  const rep = new Map(report.map(r => [r.item_id, r])); const names = new Map(stock.map(s => [s.id, s.name]));
  return <>
    <Card><CardHead title="Stock" sub="Every change is an append-only movement; stock can never go below what's reserved for orders.">
      {canStock && <span className="k-row" style={{ gap: 6 }}><Btn size="sm" variant="outline" icon={ArrowLeftRight} disabled={stock.length < 2} onClick={() => setTr({ from: stock[0]!.id, to: stock[1]!.id, qty: "1", reason: "" })}>Transfer</Btn><Btn size="sm" icon={Plus} onClick={() => setAdd(true)}>Add stock item</Btn></span>}</CardHead>
      {stock.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Item</th><th>Category</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Issued</th><th className="num">Returned</th><th className="num">Wasted</th><th className="num">Sold</th><th /></tr></thead><tbody>
        {stock.map(s => { const r = rep.get(s.id); return <tr key={s.id}><td><b>{s.name}</b>{s.sku && <small className="k-muted"> · {s.sku}</small>}{r?.low_stock && <> <Chip tone="amber">Low</Chip></>}<br /><small className="k-muted">{s.event_id ? "This event" : "Workspace"} · {s.unit}</small></td>
          <td>{CATS.find(c => c[0] === s.category)?.[1]}</td><td className="num">{num(s.on_hand)}</td><td className="num">{num(s.reserved)}</td><td className="num">{num(r?.issued ?? 0)}</td><td className="num">{num(r?.returned ?? 0)}</td><td className="num">{num(r?.wasted ?? 0)}</td><td className="num">{num(r?.sold ?? 0)}</td>
          <td>{canStock && <Btn size="sm" variant="outline" onClick={() => setMv({ item: s, kind: "receive", qty: "", reason: "", rid: rid() })} aria-label={`Record movement for ${s.name}`}>Record</Btn>}</td></tr>; })}</tbody></table></div>
        : <Empty icon={Package} title="No stock yet" text="Add bar stock, consumables, equipment or merchandise to track movements for this event." action={canStock ? <Btn size="sm" icon={Plus} onClick={() => setAdd(true)}>Add the first item</Btn> : undefined} />}
      {!canStock && <p className="k-xs k-muted">Read only — event edit permission is needed to record stock.</p>}
    </Card>
    <Card><CardHead title="Recent movements" sub="Newest first. Movements can't be edited or deleted — correct mistakes with an adjustment." />
      {movements.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>When</th><th>Item</th><th>Movement</th><th className="num">Change</th><th className="num">On hand after</th><th>Reason / ref</th></tr></thead><tbody>
        {movements.map(m => <tr key={m.id}><td>{dateShort(m.created_at)} {time(m.created_at)}</td><td>{names.get(m.item_id)}</td><td>{m.kind.replace(/_/g, " ")}</td><td className={`num ${m.delta < 0 ? "k-red" : "k-green"}`}>{m.delta > 0 ? "+" : ""}{num(m.delta)}</td><td className="num">{m.on_hand_after != null ? num(m.on_hand_after) : "—"}</td><td className="k-small oc-ellipsis">{m.reason ?? m.ref ?? "—"}</td></tr>)}</tbody></table></div>
        : <p className="k-small k-muted">No movements yet.</p>}
    </Card>
    <Dialog open={add} onClose={() => setAdd(false)} title="Add stock item" footer={<><Btn variant="ghost" onClick={() => setAdd(false)}>Cancel</Btn><Btn disabled={pending || n.name.trim().length < 2} onClick={async () => { const r = await run(() => createStockItem(eventId, { name: n.name, category: n.category, ...(n.sku ? { sku: n.sku } : {}), unit: n.unit || "each", ...(n.reorder ? { reorder_level: Number(n.reorder) } : {}), event_only: n.eventOnly })); if (r.ok) { setAdd(false); setN({ ...n, name: "", sku: "" }); } }}>Add item</Btn></>}>
      <div className="oc-form"><label className="k-field oc-span2"><span>Name</span><input className="k-input" maxLength={120} value={n.name} onChange={e => setN({ ...n, name: e.target.value })} placeholder="e.g. Tour T-shirt (M)" /></label>
        <label className="k-field"><span>Category</span><select className="k-select" value={n.category} onChange={e => setN({ ...n, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="k-field"><span>SKU (optional)</span><input className="k-input" maxLength={40} value={n.sku} onChange={e => setN({ ...n, sku: e.target.value.replace(/[^A-Za-z0-9\-_.]/g, "") })} /></label>
        <label className="k-field"><span>Unit</span><input className="k-input" maxLength={20} value={n.unit} onChange={e => setN({ ...n, unit: e.target.value })} /></label>
        <label className="k-field"><span>Reorder level (optional)</span><input className="k-input" inputMode="numeric" value={n.reorder} onChange={e => setN({ ...n, reorder: e.target.value.replace(/\D/g, "") })} /></label>
        <label className="k-row oc-span2" style={{ gap: 8 }}><input type="checkbox" checked={n.eventOnly} onChange={e => setN({ ...n, eventOnly: e.target.checked })} /> Only for this event (untick to share across the workspace)</label></div>
      <p className="k-xs k-muted">New items start at zero — record a delivery to add stock.</p>
    </Dialog>
    <Dialog open={!!mv} onClose={() => setMv(null)} title={`Record movement · ${mv?.item.name ?? ""}`} sub={mv ? `On hand ${num(mv.item.on_hand)} · reserved ${num(mv.item.reserved)}` : undefined}
      footer={<><Btn variant="ghost" onClick={() => setMv(null)}>Cancel</Btn><Btn disabled={pending || !mv?.qty} onClick={async () => { if (!mv) return; const q = Number(mv.qty); const r = await run(() => moveStock(eventId, mv.item.id, mv.kind, mv.kind === "adjust" ? Math.abs(q) : q, mv.reason, mv.rid, mv.kind === "adjust" ? q : undefined)); if (r.ok) setMv(null); }}>Record</Btn></>}>
      {mv && <div className="oc-form"><label className="k-field oc-span2"><span>Movement</span><select className="k-select" value={mv.kind} onChange={e => setMv({ ...mv, kind: e.target.value })}>{MOVES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="k-field"><span>{mv.kind === "count" ? "Counted on hand" : mv.kind === "adjust" ? "Change (use − to reduce)" : "Quantity"}</span><input className="k-input" inputMode="numeric" value={mv.qty} onChange={e => setMv({ ...mv, qty: e.target.value.replace(mv.kind === "adjust" ? /[^\d-]/g : /\D/g, "") })} /></label>
        <label className="k-field"><span>Reason{["adjust", "waste"].includes(mv.kind) ? " (required)" : ""}</span><input className="k-input" maxLength={300} value={mv.reason} onChange={e => setMv({ ...mv, reason: e.target.value })} /></label></div>}
    </Dialog>
    <Dialog open={!!tr} onClose={() => setTr(null)} title="Transfer stock" sub="Between two items of the same category (for example the workspace store and this event)."
      footer={<><Btn variant="ghost" onClick={() => setTr(null)}>Cancel</Btn><Btn disabled={pending || !tr || tr.from === tr.to || !Number(tr.qty)} onClick={async () => { if (!tr) return; const r = await run(() => transferStockBetween(eventId, tr.from, tr.to, Number(tr.qty), tr.reason)); if (r.ok) setTr(null); }}>Transfer</Btn></>}>
      {tr && <div className="oc-form"><label className="k-field"><span>From</span><select className="k-select" value={tr.from} onChange={e => setTr({ ...tr, from: e.target.value })}>{stock.map(s => <option key={s.id} value={s.id}>{s.name} ({s.on_hand - s.reserved} free)</option>)}</select></label>
        <label className="k-field"><span>To</span><select className="k-select" value={tr.to} onChange={e => setTr({ ...tr, to: e.target.value })}>{stock.filter(s => s.category === stock.find(x => x.id === tr.from)?.category).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="k-field"><span>Quantity</span><input className="k-input" inputMode="numeric" value={tr.qty} onChange={e => setTr({ ...tr, qty: e.target.value.replace(/\D/g, "") })} /></label>
        <label className="k-field"><span>Reason</span><input className="k-input" maxLength={300} value={tr.reason} onChange={e => setTr({ ...tr, reason: e.target.value })} /></label></div>}
    </Dialog>
  </>;
}

/** Owner decision: merch sells on the organiser's own store; this link becomes "Shop merch" on the public event page. */
function MerchLinkCard({ eventId, initial, canEdit }: { eventId: string; initial: string; canEdit: boolean }) {
  const { run, pending } = useAction(); const [v, setV] = useState(initial);
  return <Card><CardHead title="Merch store link" sub="Where attendees buy your merchandise. Shown as “Shop merch” on your public event page and opens in a new tab." />
    <form className="k-row" style={{ gap: 8, flexWrap: "wrap" }} onSubmit={ev => { ev.preventDefault(); void run(() => saveMerchUrl(eventId, v)); }}>
      <input className="k-input" style={{ flex: "1 1 280px" }} type="url" inputMode="url" placeholder="https://shop.example.com/your-event" value={v} maxLength={500} disabled={!canEdit || pending} onChange={x => setV(x.target.value)} aria-label="Merch store link (https)" />
      <Btn size="sm" type="submit" disabled={!canEdit || pending || v.trim() === initial.trim()}>Save link</Btn>
      {initial && <Btn size="sm" variant="outline" type="button" disabled={!canEdit || pending} onClick={() => { setV(""); void run(() => saveMerchUrl(eventId, "")); }}>Remove</Btn>}
    </form></Card>;
}
function MerchPanel({ eventId, stock, merch, canMerch }: Parameters<typeof MerchClient>[0]) {
  const { run, pending } = useAction(); const merchStock = stock.filter(s => s.category === "merchandise");
  const [add, setAdd] = useState(false); const [n, setN] = useState({ name: "", stock: merchStock[0]?.id ?? "", price: "", vat: "20", limit: "10" });
  const byId = new Map(stock.map(s => [s.id, s]));
  return <Card><CardHead title="Merch items" sub="What attendees can buy. Each item draws from a merchandise stock line; reservations hold stock for 15 minutes.">{canMerch && <Btn size="sm" icon={Plus} disabled={!merchStock.length} title={!merchStock.length ? "Add a merchandise stock item first" : undefined} onClick={() => setAdd(true)}>Add merch item</Btn>}</CardHead>
    {merch.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Item</th><th className="num">Price</th><th className="num">VAT</th><th className="num">Per order</th><th className="num">Available</th><th>Status</th><th /></tr></thead><tbody>
      {merch.map(m => { const s = byId.get(m.stock_item_id); return <tr key={m.id}><td><b>{m.name}</b><br /><small className="k-muted">{s?.name ?? "Stock item"}</small></td><td className="num">{gbp(m.price_minor)}</td><td className="num">{(m.vat_rate_bps / 100).toFixed(0)}%</td><td className="num">{m.per_order_limit}</td><td className="num">{s ? num(Math.max(0, s.on_hand - s.reserved)) : "—"}</td>
        <td><Chip tone={MST[m.status]?.[1]}>{MST[m.status]?.[0]}</Chip></td>
        <td>{canMerch && <span className="k-row" style={{ gap: 4 }}>{m.status !== "on_sale" && <Btn size="sm" variant="outline" disabled={pending} onClick={() => void run(() => setMerchStatus(eventId, m.id, "on_sale"))}>Put on sale</Btn>}{m.status === "on_sale" && <Btn size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => setMerchStatus(eventId, m.id, "off_sale"))}>Take off sale</Btn>}</span>}</td></tr>; })}</tbody></table></div>
      : <Empty icon={ShoppingBag} title="No merch items" text={merchStock.length ? "Price a merchandise stock line to sell it to attendees." : "Add a stock item in the Merchandise category first, then price it here."} action={canMerch && merchStock.length ? <Btn size="sm" icon={Plus} onClick={() => setAdd(true)}>Add merch item</Btn> : undefined} />}
    {!canMerch && <p className="k-xs k-muted">Owners and managers (ticket permission) manage merch items.</p>}
    <Dialog open={add} onClose={() => setAdd(false)} title="Add merch item" sub="Starts as a draft; put it on sale when ready."
      footer={<><Btn variant="ghost" onClick={() => setAdd(false)}>Cancel</Btn><Btn disabled={pending || n.name.trim().length < 2 || !n.stock || n.price === ""} onClick={async () => { const r = await run(() => createMerchItem(eventId, { name: n.name, stock_item_id: n.stock, price_minor: Math.round(Number(n.price) * 100), vat_rate_bps: Math.round(Number(n.vat) * 100), per_order_limit: Number(n.limit) || 10, status: "draft" })); if (r.ok) { setAdd(false); setN({ ...n, name: "", price: "" }); } }}>Add item</Btn></>}>
      <div className="oc-form"><label className="k-field oc-span2"><span>Name</span><input className="k-input" maxLength={120} value={n.name} onChange={e => setN({ ...n, name: e.target.value })} /></label>
        <label className="k-field oc-span2"><span>Stock item</span><select className="k-select" value={n.stock} onChange={e => setN({ ...n, stock: e.target.value })}>{merchStock.map(s => <option key={s.id} value={s.id}>{s.name} · {s.on_hand} on hand</option>)}</select></label>
        <label className="k-field"><span>Price incl. VAT (£)</span><input className="k-input" inputMode="decimal" value={n.price} onChange={e => setN({ ...n, price: e.target.value.replace(/[^\d.]/g, "") })} /></label>
        <label className="k-field"><span>VAT rate (%)</span><select className="k-select" value={n.vat} onChange={e => setN({ ...n, vat: e.target.value })}><option value="20">20%</option><option value="5">5%</option><option value="0">0%</option></select></label>
        <label className="k-field"><span>Max per order</span><input className="k-input" inputMode="numeric" value={n.limit} onChange={e => setN({ ...n, limit: e.target.value.replace(/\D/g, "") })} /></label></div>
    </Dialog>
  </Card>;
}

function OrdersPanel({ eventId, merch, orders, canRefund, canOrders, canStock }: Parameters<typeof MerchClient>[0]) {
  const { run, pending } = useAction(); const toast = useKitToast(); const router = useRouter();
  const [code, setCode] = useState({ ref: "", code: "" }); const [rf, setRf] = useState<{ o: OrderRow; qty: Record<string, number>; restock: boolean; reason: string } | null>(null); const [busy, setBusy] = useState(false);
  const names = new Map(merch.map(m => [m.id, m.name]));
  const refundable = (o: OrderRow) => ["paid", "collected", "partially_refunded"].includes(o.status) && o.lines.some(l => l.refunded_qty < l.qty);
  const amount = rf ? rf.o.lines.reduce((a, l) => a + (rf.qty[l.merch_item_id] ?? 0) * l.unit_minor, 0) : 0;
  const refund = async () => {
    if (!rf) return; setBusy(true);
    try {
      const res = await fetch("/api/merch/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_ref: rf.o.order_ref, restock: rf.restock, reason: rf.reason,
        lines: Object.entries(rf.qty).filter(([, q]) => q > 0).map(([merch_item_id, qty]) => ({ merch_item_id, qty })) }) });
      const j = await res.json().catch(() => ({})) as { error?: string; refund_minor?: number; card_refund?: string };
      if (!res.ok) { toast(j.error ?? "Couldn't refund the order.", "error"); return; }
      toast(`Refunded ${gbp(j.refund_minor ?? 0)}${j.card_refund === "succeeded" ? " to the buyer's card" : j.card_refund === "none" ? " (no card payment to return)" : j.card_refund === "pending" || j.card_refund === "queued" ? " — card refund in progress" : j.card_refund === "failed" ? " — card refund will retry automatically" : ""}`);
      setRf(null); router.refresh();
    } catch { toast("Network error — the refund was not sent.", "error"); } finally { setBusy(false); }
  };
  if (!canOrders) return <Card><Empty icon={ShoppingBag} title="Orders are restricted" text="Merch orders are visible to people with sales or finance access." /></Card>;
  return <>
    <div className="oc-split">
      <Card><CardHead title="Merch orders" sub="Paid by card on your connected Stripe account; Gala Dock's fee is taken as an application fee." />
        {orders.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Order</th><th>Items</th><th className="num">Total</th><th className="num">Refunded</th><th>Status</th><th /></tr></thead><tbody>
          {orders.map(o => <tr key={o.id}><td><code>{o.order_ref}</code><br /><small className="k-muted">{dateShort(o.created_at)} {time(o.created_at)}</small></td>
            <td className="k-small">{o.lines.map(l => `${l.qty}× ${names.get(l.merch_item_id) ?? "Item"}${l.refunded_qty ? ` (${l.refunded_qty} refunded)` : ""}`).join(", ") || "—"}</td>
            <td className="num">{gbp(o.total_minor)}</td><td className="num">{o.refunded_minor ? gbp(o.refunded_minor) : "—"}</td>
            <td><Chip tone={OST[o.status]?.[1]}>{OST[o.status]?.[0] ?? o.status}</Chip>{o.card_refunds.some(c => ["requested", "processing", "pending"].includes(c.status)) && <><br /><small className="k-muted">Card refund in progress</small></>}{o.card_refunds.some(c => c.status === "failed") && <><br /><small className="k-amber">Card refund retrying</small></>}{o.refund_required && <><br /><small className="k-amber">Paid after expiry — auto refund</small></>}</td>
            <td>{refundable(o) && (canRefund ? <Btn size="sm" variant="outline" icon={RotateCcw} onClick={() => setRf({ o, qty: Object.fromEntries(o.lines.map(l => [l.merch_item_id, l.qty - l.refunded_qty])), restock: true, reason: "customer_cancelled" })}>Refund</Btn>
              : <span className="k-xs k-muted" title="Refunds need refund approval permission (owner or finance).">Refund: owner/finance</span>)}</td></tr>)}</tbody></table></div>
          : <Empty icon={ShoppingBag} title="No merch orders yet" text="Orders appear here once attendees buy merch from the event page." />}
      </Card>
      <Card><CardHead title="Collect an order" sub="At the merch desk: the buyer shows their order reference and one-time collection code." />
        {canStock ? <form className="k-col" style={{ gap: 10 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => collectMerchOrder(eventId, code.ref, code.code)); if (r.ok) setCode({ ref: "", code: "" }); }}>
          <label className="k-field"><span>Order reference</span><input className="k-input" value={code.ref} onChange={e => setCode({ ...code, ref: e.target.value.toUpperCase() })} placeholder="GD-M-XXXXXXXXXX" autoComplete="off" /></label>
          <label className="k-field"><span>Collection code</span><input className="k-input" value={code.code} onChange={e => setCode({ ...code, code: e.target.value.toUpperCase() })} placeholder="8 characters" autoComplete="off" /></label>
          <Btn type="submit" icon={ScanLine} disabled={pending || !code.ref || !code.code}>Mark collected</Btn>
          <p className="k-xs k-muted"><Info size={12} aria-hidden /> Each code works once. Unpaid or refunded orders can&apos;t be collected.</p></form>
          : <p className="k-small k-muted">Scanning or event edit permission is needed to hand over orders.</p>}
      </Card>
    </div>
    <Dialog open={!!rf} onClose={() => setRf(null)} title={`Refund ${rf?.o.order_ref ?? ""}?`} sub="The amount goes back to the buyer's card from your connected account. This can't be undone."
      footer={<><Btn variant="ghost" onClick={() => setRf(null)}>Cancel</Btn><Btn variant="danger" disabled={busy || amount <= 0} onClick={() => void refund()}>Refund {gbp(amount)}</Btn></>}>
      {rf && <div className="k-col" style={{ gap: 10 }}>
        <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Item</th><th className="num">Unit</th><th className="num">Refund qty</th></tr></thead><tbody>{rf.o.lines.map(l => { const max = l.qty - l.refunded_qty; return <tr key={l.merch_item_id}><td>{names.get(l.merch_item_id) ?? "Item"}</td><td className="num">{gbp(l.unit_minor)}</td>
          <td className="num"><input className="k-input" style={{ width: 70 }} inputMode="numeric" aria-label={`Quantity to refund for ${names.get(l.merch_item_id) ?? "item"}`} disabled={max <= 0} value={rf.qty[l.merch_item_id] ?? 0} onChange={e => setRf({ ...rf, qty: { ...rf.qty, [l.merch_item_id]: Math.max(0, Math.min(max, Number(e.target.value.replace(/\D/g, "")) || 0)) } })} /> <small className="k-muted">of {max}</small></td></tr>; })}</tbody></table></div>
        <label className="k-field"><span>Reason</span><select className="k-select" value={rf.reason} onChange={e => setRf({ ...rf, reason: e.target.value })}>{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="k-row" style={{ gap: 8 }}><input type="checkbox" checked={rf.restock} onChange={e => setRf({ ...rf, restock: e.target.checked })} /> Return the items to stock</label>
        {rf.o.status === "collected" && <p className="k-small k-amber"><AlertTriangle size={13} aria-hidden /> This order was already collected — make sure the items are back before restocking.</p>}
      </div>}
    </Dialog>
  </>;
}
