import type { Metadata } from "next";
import { Restricted } from "@/components/workspace/kit";
import { requireAdminPermission } from "@/lib/admin/context";
import { dateShort, money } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";
import { Head } from "../../_b/kit";
import { BoostPauseForm, PlacementForm } from "./forms";
import "@/styles/admin-b.css";
import "@/styles/admin-disputes.css";

export const metadata: Metadata = { title: "Advertising" };

type Placement = { key: string; label: string; surface: string; capacity: number; floor_cpm_minor: number; freq_cap_per_day: number; active: boolean };
type Boost = { id: string; workspace_id: string; event_id: string | null; listing_id: string | null; product_key: string; status: string; starts_at: string; ends_at: string;
  amount_minor: number; impression_goal: number | null; delivered_impressions: number; delivered_clicks: number; paused_at: string | null; paused_reason: string | null };
type Credit = { boost_id: string; amount_minor: number; status: string; refunded_minor: number | null; refund_error: string | null; refund_attempts: number };

/**
 * Q56 ads operations (commerce permission). Boosts are prepaid fixed-price placements (no auction); the creative is the event or
 * listing itself, so policy enforcement is a pause with a reason (the advertiser is told; paused time is refunded at the end).
 * Placements can be switched off one by one, or all at once (kill switch). Every change is audited by the RPCs.
 */
export default async function AdvertisingPage() {
  const { db, allowed } = await requireAdminPermission("commerce");
  if (!allowed) return <Restricted area="Advertising" />;
  const since = new Date(requestTime() - 30 * 864e5).toISOString();
  const [{ data: pl }, { data: bs }] = await Promise.all([
    db.from("ad_placements").select("key,label,surface,capacity,floor_cpm_minor,freq_cap_per_day,active").order("key"),
    db.from("promotion_boosts").select("id,workspace_id,event_id,listing_id,product_key,status,starts_at,ends_at,amount_minor,impression_goal,delivered_impressions,delivered_clicks,paused_at,paused_reason")
      .or(`status.in.(active,scheduled),ends_at.gte.${since}`).neq("status", "pending_payment").order("starts_at", { ascending: false }).limit(200),
  ]);
  const placements = (pl ?? []) as Placement[], boosts = (bs ?? []) as Boost[];
  const ids = boosts.map(b => b.id), evIds = [...new Set(boosts.flatMap(b => b.event_id ? [b.event_id] : []))], wsIds = [...new Set(boosts.map(b => b.workspace_id))];
  const [{ data: cr }, { data: ev }, { data: ws }] = await Promise.all([
    ids.length ? db.from("ad_credit_ledger").select("boost_id,amount_minor,status,refunded_minor,refund_error,refund_attempts").in("boost_id", ids) : Promise.resolve({ data: [] }),
    evIds.length ? db.from("events").select("id,name").in("id", evIds) : Promise.resolve({ data: [] }),
    wsIds.length ? db.from("workspaces").select("id,name").in("id", wsIds) : Promise.resolve({ data: [] }),
  ]);
  const credit = new Map(((cr ?? []) as Credit[]).map(c => [c.boost_id, c]));
  const evName = new Map(((ev ?? []) as { id: string; name: string }[]).map(e => [e.id, e.name]));
  const wsName = new Map(((ws ?? []) as { id: string; name: string }[]).map(w => [w.id, w.name]));
  const live = boosts.filter(b => ["active", "scheduled"].includes(b.status)), past = boosts.filter(b => !["active", "scheduled"].includes(b.status));
  const allOn = placements.some(p => p.active);
  const subject = (b: Boost) => b.event_id ? evName.get(b.event_id) ?? `Event ${b.event_id.slice(0, 8)}` : `Listing ${String(b.listing_id).slice(0, 8)}`;
  const delivery = (b: Boost) => `${Number(b.delivered_impressions).toLocaleString("en-GB")} / ${Number(b.impression_goal ?? 0).toLocaleString("en-GB")} · ${Number(b.delivered_clicks).toLocaleString("en-GB")} clicks`;
  const refund = (b: Boost) => { const c = credit.get(b.id); if (!c) return "—";
    return c.status === "refunded" ? `${money(Number(c.refunded_minor ?? 0) / 100)} refunded` : c.refund_attempts >= 5 ? `Refund failed: ${c.refund_error ?? "error"}` : `${money(c.amount_minor / 100)} ex VAT due`; };

  return <div className="adb add">
    <Head title="Advertising" subtitle="Sponsored placements: delivery, policy pauses and the kill switch. Boosts are prepaid at a fixed price; undelivered impressions are refunded to the advertiser's card when a flight ends." />
    <section className="adb-panel" aria-labelledby="ad-pl"><h2 id="ad-pl">Placements</h2>
      <table className="adb-table"><thead><tr><th>Placement</th><th>Surface</th><th>Slots</th><th>CPM floor</th><th>Cap / viewer / day</th><th>State</th><th>Change</th></tr></thead>
        <tbody>{placements.map(p => <tr key={p.key}><td><b>{p.label}</b><br /><code>{p.key}</code></td><td>{p.surface}</td><td>{p.capacity}</td><td>{money(p.floor_cpm_minor / 100)}</td><td>{p.freq_cap_per_day}</td>
          <td>{p.active ? "On" : "Off"}</td><td><PlacementForm k={p.key} active={p.active} label={p.label} /></td></tr>)}</tbody></table>
      <h3>Kill switch</h3><PlacementForm k="*" active={allOn} label="all placements" /></section>
    <section className="adb-panel" aria-labelledby="ad-live"><h2 id="ad-live">Running and scheduled ({live.length})</h2>
      <table className="adb-table"><thead><tr><th>Advertiser</th><th>Promoting</th><th>Product</th><th>Flight</th><th>Delivered</th><th>Paid (ex VAT)</th><th>Policy</th></tr></thead>
        <tbody>{live.length ? live.map(b => <tr key={b.id}><td>{wsName.get(b.workspace_id) ?? b.workspace_id.slice(0, 8)}</td><td>{subject(b)}</td><td>{b.product_key}</td>
          <td>{dateShort(b.starts_at)} → {dateShort(b.ends_at)}</td><td>{delivery(b)}</td><td>{money(b.amount_minor / 100)}</td>
          <td>{b.paused_at ? <><b>Paused</b> · {b.paused_reason}<br /></> : null}<BoostPauseForm id={b.id} paused={!!b.paused_at} label={subject(b)} /></td></tr>)
          : <tr><td colSpan={7} className="add-muted">No boosts running.</td></tr>}</tbody></table></section>
    {past.length > 0 && <section className="adb-panel" aria-labelledby="ad-past"><h2 id="ad-past">Ended in the last 30 days</h2>
      <table className="adb-table"><thead><tr><th>Advertiser</th><th>Promoting</th><th>Status</th><th>Delivered</th><th>Paid (ex VAT)</th><th>Undelivered refund</th></tr></thead>
        <tbody>{past.map(b => <tr key={b.id}><td>{wsName.get(b.workspace_id) ?? b.workspace_id.slice(0, 8)}</td><td>{subject(b)}</td><td>{b.status}</td><td>{delivery(b)}</td>
          <td>{money(b.amount_minor / 100)}</td><td>{refund(b)}</td></tr>)}</tbody></table></section>}
  </div>;
}
