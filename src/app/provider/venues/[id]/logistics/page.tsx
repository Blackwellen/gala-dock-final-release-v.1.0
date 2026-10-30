import { notFound } from "next/navigation";
import Link from "next/link";
import { Truck } from "lucide-react";
import { getProvider } from "@/lib/provider/context";
import { PageHeader, Chip } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requestTime } from "@/lib/workspace/format";
import { saveLoadingBay, setLoadingBayStatus } from "./actions";
import "@/styles/provider-logistics.css";

export const metadata = { title: "Loading bays" };
type Bay = { id: string; name: string; max_vehicle: string; max_length_m: number | null; turnaround_minutes: number; access_route: string; notes: string; status: string };
type Win = { id: string; bay_id: string; kind: string; supplier_name: string; starts_at: string; ends_at: string; busy_until: string; vehicle: string; status: string };
const KIND: Record<string, string> = { delivery: "Delivery", collection: "Collection", load_in: "Load-in", load_out: "Load-out", storage: "Storage" };
const DAY_START = 6, DAY_END = 24;   // timeline 06:00–24:00 (London)
const tz = { timeZone: "Europe/London" } as const;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...tz });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", tz);
const hourOf = (iso: string) => { const [h, m] = hm(iso).split(":").map(Number); return h! + m! / 60; };

/**
 * Q25 · Venue loading bays and bay windows (venue side). Bays: name, vehicle limits, turnaround, access route; closing a bay stops
 * new bookings on it. Windows: every delivery, collection, load-in/out and storage slot organisers have booked on these bays for the
 * next 14 days, with the turnaround shown after each one — the same exclusion that refuses overlapping slots across tenants.
 */
export default async function VenueLogisticsPage({ params }: PageProps<"/provider/venues/[id]/logistics">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getProvider();
  const { data: v } = await ctx.db.from("listings").select("id,name").eq("id", id).eq("workspace_id", ctx.workspace.id).eq("kind", "venue").maybeSingle();
  if (!v) notFound();
  const now = requestTime(), until = new Date(now + 14 * 864e5).toISOString();
  const { data: bays } = await ctx.db.from("loading_bays").select("id,name,max_vehicle,max_length_m,turnaround_minutes,access_route,notes,status").eq("listing_id", id).order("name");
  const B = (bays ?? []) as Bay[];
  const { data: wins } = B.length ? await ctx.db.from("logistics_windows").select("id,bay_id,kind,supplier_name,starts_at,ends_at,busy_until,vehicle,status")
    .in("bay_id", B.map(b => b.id)).neq("status", "cancelled").gte("busy_until", new Date(now).toISOString()).lte("starts_at", until).order("starts_at") : { data: [] };
  const W = (wins ?? []) as Win[];
  const days = [...new Set(W.map(w => dayKey(w.starts_at)))].sort();
  const manage = ctx.can.manage;
  const pct = (h: number) => `${Math.max(0, Math.min(100, ((h - DAY_START) / (DAY_END - DAY_START)) * 100))}%`;
  const fields = (b?: Bay) => <>
    <label>Name<input name="name" required maxLength={120} defaultValue={b?.name} placeholder="e.g. Rear yard bay 1" /></label>
    <label>Largest vehicle<input name="max_vehicle" maxLength={80} defaultValue={b?.max_vehicle} placeholder="e.g. 7.5t box van" /></label>
    <label>Max length (m)<input name="max_length_m" inputMode="decimal" maxLength={8} defaultValue={b?.max_length_m ?? ""} /></label>
    <label>Turnaround (min)<input name="turnaround_minutes" type="number" min={0} max={240} step={5} defaultValue={b?.turnaround_minutes ?? 15} /></label>
    <label className="wide">Access route<input name="access_route" maxLength={500} defaultValue={b?.access_route} placeholder="Gate, height limits, where to report" /></label>
    <label className="wide">Notes<input name="notes" maxLength={500} defaultValue={b?.notes} /></label></>;

  return <div className="lg">
    <PageHeader title="Loading bays" subtitle={`${v.name} · delivery, load-in and load-out slots organisers can book`} back={{ href: `/provider/venues/${id}?tab=operations`, label: v.name }} />
    <section className="ws-panel lg-panel" aria-labelledby="lg-bays"><div className="ws-panel-head"><h2 id="lg-bays"><Truck aria-hidden="true" />Bays</h2><small>{B.filter(b => b.status === "active").length} open · turnaround is added after every booked slot</small></div>
      {!B.length ? <p className="lg-empty">No loading bays yet. Add the bays suppliers use so organisers can book delivery and load-in slots that never clash.</p>
        : <ul className="lg-bays">{B.map(b => <li key={b.id} className={b.status === "closed" ? "closed" : ""}>
          <div className="lg-bay-head"><b>{b.name}</b>{b.status === "closed" ? <Chip tone="grey">Closed</Chip> : <Chip tone="green" dot>Open</Chip>}
            <small>{[b.max_vehicle, b.max_length_m ? `≤ ${b.max_length_m} m` : "", `${b.turnaround_minutes} min turnaround`].filter(Boolean).join(" · ")}</small>
            {manage && <ActionButton action={setLoadingBayStatus} args={[id, b.id, b.status === "closed" ? "active" : "closed"]} variant="outline"
              confirm={b.status === "closed" ? undefined : { title: `Close ${b.name}?`, body: "Existing slots stay booked. Organisers can’t book new slots on a closed bay.", cta: "Close bay" }}>{b.status === "closed" ? "Reopen" : "Close bay"}</ActionButton>}</div>
          {b.access_route && <p className="lg-route">{b.access_route}</p>}
          {manage && <details><summary>Edit bay</summary><ActionForm action={saveLoadingBay.bind(null, id, b.id)} className="pv-grid lg-form">{fields(b)}<div className="wide pv-form-foot"><button className="ws-btn primary sm">Save bay</button></div></ActionForm></details>}
        </li>)}</ul>}
      {manage && <details className="lg-add" open={!B.length}><summary className="ws-btn outline sm">Add a loading bay</summary>
        <ActionForm action={saveLoadingBay.bind(null, id, null)} className="pv-grid lg-form" resetOnSuccess>{fields()}<div className="wide pv-form-foot"><button className="ws-btn primary sm">Add bay</button></div></ActionForm></details>}
      {!manage && <p className="lg-empty">Only owners and managers can change bays.</p>}
    </section>

    <section className="ws-panel lg-panel" aria-labelledby="lg-win"><div className="ws-panel-head"><h2 id="lg-win">Bay windows · next 14 days</h2><small>{W.length} booked slot{W.length === 1 ? "" : "s"}</small></div>
      {!W.length ? <p className="lg-empty">No delivery or load-in slots are booked on your bays in the next 14 days.</p>
        : days.map(d => <div key={d} className="lg-day"><h3>{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</h3>
          <div className="lg-scale" aria-hidden="true">{[6, 9, 12, 15, 18, 21].map(h => <span key={h} style={{ left: pct(h) }}>{String(h).padStart(2, "0")}:00</span>)}</div>
          {B.filter(b => W.some(w => w.bay_id === b.id && dayKey(w.starts_at) === d)).map(b => <div key={b.id} className="lg-row"><span className="lg-row-name">{b.name}</span>
            <div className="lg-track">{W.filter(w => w.bay_id === b.id && dayKey(w.starts_at) === d).map(w => { const s = hourOf(w.starts_at), e = Math.max(s + 0.1, dayKey(w.ends_at) === d ? hourOf(w.ends_at) : 24), t = dayKey(w.busy_until) === d ? hourOf(w.busy_until) : 24;
              return <span key={w.id} className={`lg-win ${w.kind} ${w.status}`} style={{ left: pct(s), width: `calc(${pct(t)} - ${pct(s)})` }} title={`${KIND[w.kind] ?? w.kind} ${hm(w.starts_at)}–${hm(w.ends_at)}${w.supplier_name ? ` · ${w.supplier_name}` : ""}`}>
                <i style={{ width: t > s ? `${((e - s) / (t - s)) * 100}%` : "100%" }} /></span>; })}</div></div>)}
          <ul className="lg-list">{W.filter(w => dayKey(w.starts_at) === d).map(w => <li key={w.id}><b>{hm(w.starts_at)}–{hm(w.ends_at)}</b><span>{KIND[w.kind] ?? w.kind}{w.supplier_name ? ` · ${w.supplier_name}` : ""}{w.vehicle ? ` · ${w.vehicle}` : ""}</span>
            <small>{B.find(b => b.id === w.bay_id)?.name} · bay free from {hm(w.busy_until)}</small><Chip tone={w.status === "confirmed" ? "green" : w.status === "completed" ? "grey" : "orange"}>{w.status[0]!.toUpperCase() + w.status.slice(1)}</Chip></li>)}</ul>
        </div>)}
      <p className="lg-note">Slots are booked by organisers from their event’s Operations › Logistics page. <Link href="/provider/calendar">Open your calendar</Link> to see the events they belong to.</p>
    </section>
  </div>;
}
