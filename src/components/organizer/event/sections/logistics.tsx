import { Truck, ParkingSquare, BedDouble, Warehouse, ClipboardList, Lock } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { money, dateShort, time } from "@/lib/format";
import { logisticsCommand } from "@/lib/actions/logistics";
import { TaskCheck, AddTaskButton } from "../controls";
import type { SectionProps } from "./types";
import { GettingThereCard } from "./logistics-public";
import { FormDialog, ActionButton, type Field, type FieldOption } from "./ops-forms-client";
import { canManage, VIEW_ONLY, ViewOnly, ChecksCard, Stat, StatusChip, label, opsItems } from "./ops-shared";

type Move = { id: string; kind: string; status: string; party_id: string | null; crew_id: string | null; passengers: number; from_place: string; to_place: string; pickup_point: string; departs_at: string; arrives_at: string;
  vehicle_equipment_id: string | null; vehicle_label: string; public_info: boolean; notes: string };
type Priv = { passenger_names: string; flight_number: string; contact_phone: string };
type Area = { id: string; name: string; kind: string; capacity: number; accessible_spaces: number; opens_at: string | null; closes_at: string | null; access_route: string; status: string };
type Permit = { id: string; area_id: string; holder_kind: string; holder_name: string; vehicle_reg: string; accessible: boolean; valid_from: string; valid_to: string; code: string; status: string };
type Block = { id: string; hotel_name: string; address: string; contact: string; rooms_total: number; check_in: string; check_out: string; cutoff_date: string | null; nightly_rate: number; currency: string; status: string; rate_version: number; notes: string };
type Room = { id: string; block_id: string; occupant_kind: string; occupant_name: string; room_type: string; nights_from: string; nights_to: string; status: string; cost: number; currency: string; rate_version: number };
type Bay = { id: string; name: string; listing_id: string | null; event_id: string | null; max_vehicle: string; turnaround_minutes: number; access_route: string; status: string };
type Win = { id: string; kind: string; bay_id: string | null; party_id: string | null; supplier_name: string; starts_at: string; ends_at: string; busy_until: string; vehicle: string; storage_area: string; status: string; notes: string };

const MOVE_KINDS: FieldOption[] = ["talent", "crew", "guest", "supplier", "shuttle", "vip"].map(k => [k, label(k)]);
const WIN_KINDS: FieldOption[] = [["delivery", "Delivery"], ["collection", "Collection"], ["load_in", "Load-in"], ["load_out", "Load-out"], ["storage", "Storage"]];
const span = (a: string, b: string) => `${dateShort(a)} ${time(a)} – ${dateShort(a) === dateShort(b) ? "" : `${dateShort(b)} `}${time(b)}`;

export async function LogisticsSection({ e, d, role }: SectionProps) {
  const sb = untyped(await createClient()); const ev = e.id; const ws = e.workspace_id as string;
  const mgr = canManage(role); const dr = mgr ? null : VIEW_ONLY; const cmd = logisticsCommand.bind(null, ev);
  const venueListing = (e as { venue_listing_id?: string | null }).venue_listing_id ?? null;
  const venueIds = [...new Set([venueListing, ...d.items.filter(b => b.category === "venue" && b.listing_id && !["cancelled", "declined", "unavailable", "expired"].includes(b.status)).map(b => b.listing_id)].filter(Boolean))] as string[];
  const [moves, priv, areas, permits, blocks, rooms, bays, wins, parties, vehicles, checks] = await Promise.all([
    sb.from("transport_movements").select("*").eq("event_id", ev).neq("status", "cancelled").order("departs_at"),
    mgr ? sb.from("transport_private").select("movement_id,passenger_names,flight_number,contact_phone").eq("event_id", ev) : Promise.resolve({ data: [] }),
    sb.from("parking_areas").select("*").eq("event_id", ev).order("name"),
    sb.from("parking_permits").select("*").eq("event_id", ev).eq("status", "issued").order("valid_from"),
    sb.from("accommodation_blocks").select("*").eq("event_id", ev).order("check_in"),
    sb.from("room_allocations").select("*").eq("event_id", ev).neq("status", "cancelled").order("nights_from"),
    venueIds.length ? sb.from("loading_bays").select("*").eq("status", "active").or(`event_id.eq.${ev},listing_id.in.(${venueIds.join(",")})`).order("name") : sb.from("loading_bays").select("*").eq("status", "active").eq("event_id", ev).order("name"),
    sb.from("logistics_windows").select("*").eq("event_id", ev).neq("status", "cancelled").order("starts_at"),
    sb.from("event_parties").select("id,name,kind,status").eq("event_id", ev).not("status", "in", "(cancelled,withdrawn)").order("name"),
    sb.from("provider_equipment").select("id,name,category,details,status").eq("workspace_id", ws).eq("status", "active").order("name").limit(200),
    opsItems(ev, i => i.domain === "logistics" || i.key === "accessible_parking_short"),
  ]);
  const M = (moves.data ?? []) as Move[]; const PV = new Map(((priv.data ?? []) as (Priv & { movement_id: string })[]).map(x => [x.movement_id, x]));
  const A = (areas.data ?? []) as Area[]; const PM = (permits.data ?? []) as Permit[]; const BL = (blocks.data ?? []) as Block[]; const RM = (rooms.data ?? []) as Room[];
  const BY = (bays.data ?? []) as Bay[]; const W = (wins.data ?? []) as Win[]; const PT = (parties.data ?? []) as { id: string; name: string; kind: string }[];
  const VE = ((vehicles.data ?? []) as { id: string; name: string; category: string; details: { seats?: number } | null }[]);
  const crew = [...d.crewMap.values()] as { id: string; name: string }[];
  const partyOpts = PT.map(p => [p.id, `${p.name} (${p.kind})`] as FieldOption); const crewOpts = crew.map(c => [c.id, c.name] as FieldOption);
  const vehOpts = VE.map(v => [v.id, `${v.name}${v.details?.seats ? ` · ${v.details.seats} seats` : ""}`] as FieldOption);
  const bayOpts = BY.map(b => [b.id, `${b.name}${b.event_id ? " (event)" : " (venue)"}${b.turnaround_minutes ? ` · ${b.turnaround_minutes} min turnaround` : ""}`] as FieldOption);
  const tasks = d.tasks.filter(t => t.category === "logistics");

  const moveFields = (m?: Move): Field[] => { const pv = m ? PV.get(m.id) : undefined; return [
    ...(m ? [] : [{ name: "kind", label: "Movement", type: "select", options: MOVE_KINDS, required: true } as Field]),
    { name: "from_place", label: "From", defaultValue: m?.from_place, placeholder: "e.g. Heathrow T5" }, { name: "to_place", label: "To", defaultValue: m?.to_place ?? e.venue_name ?? "" },
    { name: "pickup_point", label: "Pickup point", defaultValue: m?.pickup_point }, { name: "passengers", label: "Passengers", type: "number", min: 1, max: 500, required: true, defaultValue: m?.passengers ?? 1 },
    { name: "departs_at", label: "Departs", type: "datetime", required: true, defaultValue: m?.departs_at }, { name: "arrives_at", label: "Arrives", type: "datetime", required: true, defaultValue: m?.arrives_at },
    { name: "party_id", label: "Partner / talent", type: "select", options: partyOpts, defaultValue: m?.party_id }, { name: "crew_id", label: "Crew member", type: "select", options: crewOpts, defaultValue: m?.crew_id },
    { name: "vehicle_equipment_id", label: "Vehicle (inventory)", type: "select", options: vehOpts, defaultValue: m?.vehicle_equipment_id, hint: "Locked 30 min either side; seats checked." },
    { name: "vehicle_label", label: "Vehicle label (if not in inventory)", defaultValue: m?.vehicle_label },
    ...(m ? [{ name: "status", label: "Status", type: "select", required: true, defaultValue: m.status, options: ["planned", "confirmed", "en_route", "completed", "cancelled"].map(k => [k, label(k)]) } as Field] : []),
    { name: "public_info", label: "Show to ticket holders", type: "checkbox", defaultValue: m?.public_info, hint: "Shuttle / guest only" },
    { name: "passenger_names", label: "Passenger names (private)", type: "textarea", defaultValue: pv?.passenger_names, hint: "Managers and the partner's own portal login only." },
    { name: "flight_number", label: "Flight / train (private)", defaultValue: pv?.flight_number }, { name: "contact_phone", label: "Contact phone (private)", defaultValue: pv?.contact_phone },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: m?.notes }]; };
  const areaFields = (a?: Area): Field[] => [{ name: "name", label: "Name", required: true, defaultValue: a?.name }, { name: "kind", label: "Kind", type: "select", required: true, defaultValue: a?.kind, options: ["general", "staff", "supplier", "talent", "accessible", "vip", "mixed"].map(k => [k, label(k)]) },
    { name: "capacity", label: "Total spaces", type: "number", min: 0, required: true, defaultValue: a?.capacity ?? 20 }, { name: "accessible_spaces", label: "Of which accessible", type: "number", min: 0, required: true, defaultValue: a?.accessible_spaces ?? 2 },
    { name: "opens_at", label: "Opens", type: "datetime", defaultValue: a?.opens_at }, { name: "closes_at", label: "Closes", type: "datetime", defaultValue: a?.closes_at },
    { name: "access_route", label: "Access route", type: "textarea", defaultValue: a?.access_route }, ...(a ? [{ name: "status", label: "Status", type: "select", required: true, defaultValue: a.status, options: [["active", "Active"], ["closed", "Closed"]] } as Field] : [])];
  const blockFields = (b?: Block): Field[] => [{ name: "hotel_name", label: "Hotel", required: true, defaultValue: b?.hotel_name }, { name: "address", label: "Address", defaultValue: b?.address }, { name: "contact", label: "Hotel contact", defaultValue: b?.contact },
    { name: "rooms_total", label: "Rooms in block", type: "number", min: 1, required: true, defaultValue: b?.rooms_total ?? 10 }, { name: "nightly_rate", label: "Nightly rate", type: "number", min: 0, required: true, defaultValue: b?.nightly_rate ?? 0, hint: "Changing it bumps the rate version; existing allocations keep their snapshot." },
    { name: "check_in", label: "Check-in", type: "date", required: true, defaultValue: b?.check_in ?? e.starts_at?.slice(0, 10) }, { name: "check_out", label: "Check-out", type: "date", required: true, defaultValue: b?.check_out ?? (e.ends_at ?? e.starts_at ?? "").slice(0, 10) },
    { name: "cutoff_date", label: "Release cut-off", type: "date", defaultValue: b?.cutoff_date }, { name: "status", label: "Status", type: "select", required: true, defaultValue: b?.status ?? "provisional", options: [["provisional", "Provisional"], ["confirmed", "Confirmed"], ["released", "Released"], ["cancelled", "Cancelled"]] },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: b?.notes }];
  const winFields = (w?: Win): Field[] => [{ name: "kind", label: "Window", type: "select", options: WIN_KINDS, required: true, defaultValue: w?.kind }, { name: "bay_id", label: "Loading bay", type: "select", options: bayOpts, defaultValue: w?.bay_id, hint: BY.length ? "Bays can't overlap across any event (turnaround included)." : "No bays yet — add an event bay first, or book without a bay." },
    { name: "starts_at", label: "Starts", type: "datetime", required: true, defaultValue: w?.starts_at }, { name: "ends_at", label: "Ends", type: "datetime", required: true, defaultValue: w?.ends_at },
    { name: "supplier_name", label: "Supplier", defaultValue: w?.supplier_name }, { name: "party_id", label: "Partner (exhibitor build etc.)", type: "select", options: partyOpts, defaultValue: w?.party_id },
    { name: "vehicle", label: "Vehicle", defaultValue: w?.vehicle, placeholder: "e.g. 7.5t box van" }, { name: "storage_area", label: "Storage area", defaultValue: w?.storage_area },
    { name: "status", label: "Status", type: "select", required: true, defaultValue: w?.status ?? "requested", options: [["requested", "Requested"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["cancelled", "Cancelled"]] }, { name: "notes", label: "Notes", type: "textarea", defaultValue: w?.notes }];

  const issued = (a: Area) => PM.filter(p => p.area_id === a.id);
  const nights = (r: Room) => Math.round((Date.parse(r.nights_to) - Date.parse(r.nights_from)) / 864e5);
  const roomNights = (b: Block) => RM.filter(r => r.block_id === b.id).reduce((s, r) => s + nights(r), 0);
  const totalNights = (b: Block) => b.rooms_total * Math.round((Date.parse(b.check_out) - Date.parse(b.check_in)) / 864e5);

  return <div className="eo">
    <ViewOnly role={role} what="travel, parking, rooms and loading windows" />
    <div className="eo-stats">
      <Stat icon={Truck} label="Transport" value={M.length} sub={`${M.filter(m => m.status === "confirmed").length} confirmed · ${M.reduce((s, m) => s + m.passengers, 0)} passengers`} />
      <Stat icon={ParkingSquare} label="Parking permits" value={`${PM.length}/${A.reduce((s, a) => s + a.capacity, 0)}`} sub={`${A.length} area(s)`} tone="purple" />
      <Stat icon={BedDouble} label="Room nights" value={`${BL.reduce((s, b) => s + roomNights(b), 0)}/${BL.reduce((s, b) => s + totalNights(b), 0)}`} sub={`${BL.length} block(s)`} tone="green" />
      <Stat icon={Warehouse} label="Loading windows" value={W.length} sub={`${W.filter(w => w.status === "requested").length} awaiting confirmation`} tone="amber" />
      <Stat icon={ClipboardList} label="Logistics tasks" value={`${tasks.filter(t => t.status === "done").length}/${tasks.length}`} sub="done" />
    </div>
    <div className="eo-main">
      <div className="eo-col-main">
        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Transport</h2><p className="k-small">Talent, crew, guest, supplier and shuttle movements.{!mgr && <> <Lock size={12} /> Passenger names, flights and phones are visible to managers only.</>}</p></div>
          <FormDialog label="Add movement" icon="plus" variant="primary" wide title="Add transport movement" disabledReason={dr} action={cmd.bind(null, "transport", null, {})} fields={moveFields()} /></div>
          {M.length ? <div className="eo-scroll"><table className="k-table eo-table"><thead><tr><th>When</th><th>Movement</th><th>Who</th><th>Vehicle</th><th>Status</th><th><span className="k-sr">Actions</span></th></tr></thead><tbody>{M.map(m => { const pv = PV.get(m.id);
            return <tr key={m.id}><td><b>{span(m.departs_at, m.arrives_at)}</b></td><td><b>{label(m.kind)}</b><small className="eo-block">{m.from_place || "?"} → {m.to_place || "?"}{m.pickup_point ? ` · pickup ${m.pickup_point}` : ""}</small>{m.public_info && <Chip tone="blue">Public</Chip>}</td>
              <td>{PT.find(p => p.id === m.party_id)?.name ?? (m.crew_id ? d.crewMap.get(m.crew_id)?.name : null) ?? "—"}<small className="eo-block">{m.passengers} pax{mgr && pv ? `${pv.passenger_names ? ` · ${pv.passenger_names}` : ""}${pv.flight_number ? ` · ${pv.flight_number}` : ""}${pv.contact_phone ? ` · ${pv.contact_phone}` : ""}` : ""}</small></td>
              <td>{m.vehicle_label || VE.find(v => v.id === m.vehicle_equipment_id)?.name || "—"}</td><td><StatusChip s={m.status} /></td>
              <td><FormDialog label="Edit movement" icon="edit" variant="ghost" iconOnly wide title="Edit movement" disabledReason={dr ?? (["completed", "cancelled"].includes(m.status) ? "Completed movements can't be edited." : null)} action={cmd.bind(null, "transport", m.id, { kind: m.kind })} fields={moveFields(m)} /></td></tr>; })}</tbody></table></div>
            : <Empty icon={Truck} title="No transport planned" text="Add airport pickups, crew runs, supplier deliveries or public shuttles." />}</Card>

        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Loading bays &amp; windows</h2><p className="k-small">Deliveries, collections, load-in/out and storage. Venue bays are managed by the venue; you can add event-only bays.</p></div>
          <span className="eo-acts"><FormDialog label="Add event bay" icon="plus" title="Add an event loading bay" sub="For temporary or site bays. Venue-owned bays are maintained by the venue team." disabledReason={dr} action={cmd.bind(null, "bay", null, {})} fields={[{ name: "name", label: "Name", required: true }, { name: "max_vehicle", label: "Max vehicle" }, { name: "turnaround_minutes", label: "Turnaround (minutes)", type: "number", min: 0, max: 240, required: true, defaultValue: 15 }, { name: "access_route", label: "Access route", type: "textarea" }]} />
            <FormDialog label="Book window" icon="calendar" variant="primary" title="Book a logistics window" disabledReason={dr} action={cmd.bind(null, "window", null, {})} fields={winFields()} /></span></div>
          {BY.length > 0 && <p className="k-small eo-muted">Bays: {BY.map(b => `${b.name}${b.event_id ? " (event)" : ""}`).join(" · ")}</p>}
          {W.length ? <div className="eo-scroll"><table className="k-table eo-table"><thead><tr><th>When</th><th>Window</th><th>Bay</th><th>Supplier</th><th>Status</th><th><span className="k-sr">Actions</span></th></tr></thead><tbody>{W.map(w => <tr key={w.id}>
            <td><b>{span(w.starts_at, w.ends_at)}</b>{w.busy_until > w.ends_at && <small className="eo-block">Bay busy until {time(w.busy_until)}</small>}</td><td>{label(w.kind)}{w.storage_area && <small className="eo-block">Store: {w.storage_area}</small>}</td>
            <td>{BY.find(b => b.id === w.bay_id)?.name ?? (w.bay_id ? "Bay" : "No bay")}</td><td>{w.supplier_name || PT.find(p => p.id === w.party_id)?.name || "—"}{w.vehicle && <small className="eo-block">{w.vehicle}</small>}</td><td><StatusChip s={w.status} /></td>
            <td><FormDialog label="Edit window" icon="edit" variant="ghost" iconOnly title="Edit window" disabledReason={dr} action={cmd.bind(null, "window", w.id, {})} fields={winFields(w)} /></td></tr>)}</tbody></table></div>
            : <p className="k-small eo-muted">No windows booked. Book delivery and collection slots so suppliers don&apos;t arrive after doors.</p>}</Card>

        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Accommodation</h2><p className="k-small">Room blocks with per-night capacity, cut-off dates and rate snapshots.</p></div>
          <FormDialog label="Add room block" icon="plus" variant="primary" title="Add room block" disabledReason={dr} action={cmd.bind(null, "block", null, {})} fields={blockFields()} /></div>
          {BL.length ? BL.map(b => { const rs = RM.filter(r => r.block_id === b.id); const past = b.cutoff_date && b.cutoff_date < new Date().toISOString().slice(0, 10);
            return <div key={b.id} className="eo-sub"><div className="k-between"><h4>{b.hotel_name} <span className="eo-muted">· {dateShort(b.check_in)} – {dateShort(b.check_out)} · {roomNights(b)}/{totalNights(b)} room nights · {money(b.nightly_rate, b.currency)}/night (v{b.rate_version})</span></h4>
              <span className="eo-acts"><StatusChip s={b.status} />{b.cutoff_date && <Chip tone={past ? "red" : "amber"}>{past ? "Past cut-off" : `Cut-off ${dateShort(b.cutoff_date)}`}</Chip>}
                <FormDialog label="Allocate room" icon="plus" title={`Allocate a room — ${b.hotel_name}`} disabledReason={dr ?? (["released", "cancelled"].includes(b.status) ? "This block is closed." : past ? "Past the cut-off — ask the hotel to extend it, then update the cut-off." : null)} action={cmd.bind(null, "room", b.id, {})} fields={[
                  { name: "occupant_kind", label: "Occupant", type: "select", required: true, options: ["talent", "crew", "staff", "guest", "vip", "other"].map(k => [k, label(k)]) }, { name: "occupant_name", label: "Name", required: true },
                  { name: "party_id", label: "Partner / talent", type: "select", options: partyOpts }, { name: "crew_id", label: "Crew member", type: "select", options: crewOpts }, { name: "room_type", label: "Room type", placeholder: "e.g. Double" },
                  { name: "nights_from", label: "First night", type: "date", defaultValue: b.check_in }, { name: "nights_to", label: "Check-out", type: "date", defaultValue: b.check_out },
                  { name: "status", label: "Status", type: "select", required: true, options: [["held", "Held"], ["confirmed", "Confirmed"]] }]} />
                <FormDialog label={`Edit ${b.hotel_name}`} icon="edit" variant="ghost" iconOnly title={`Edit block — ${b.hotel_name}`} disabledReason={dr} action={cmd.bind(null, "block", b.id, {})} fields={blockFields(b)} /></span></div>
              {rs.length ? <ul className="eo-list tight">{rs.map(r => <li key={r.id}><span className="k-grow"><b>{r.occupant_name}</b><small>{label(r.occupant_kind)}{r.room_type ? ` · ${r.room_type}` : ""} · {dateShort(r.nights_from)} – {dateShort(r.nights_to)} · {nights(r)} night(s) · {money(r.cost, r.currency)} (rate v{r.rate_version})</small></span><StatusChip s={r.status} />
                <ActionButton label={`Cancel ${r.occupant_name}'s room`} icon="ban" variant="ghost" iconOnly disabledReason={dr} confirm={{ title: `Cancel ${r.occupant_name}'s room?`, danger: true, confirmLabel: "Cancel room" }} action={cmd.bind(null, "room_cancel", r.id, {}, {})} /></li>)}</ul>
                : <p className="k-small eo-muted">No rooms allocated.</p>}</div>; })
            : <p className="k-small eo-muted">No room blocks. Add a hotel block for talent and crew.</p>}</Card>
      </div>
      <div className="eo-col-side">
        <ChecksCard title="Logistics checks" items={checks.items} error={checks.error} empty="No late arrivals, missing transport or rooms, unconfirmed windows or access-slot gaps." />
        <Card><div className="k-between"><h3 className="ov-h">Parking</h3><FormDialog label="Add area" icon="plus" title="Add parking area" disabledReason={dr} action={cmd.bind(null, "area", null, {})} fields={areaFields()} /></div>
          {A.length ? A.map(a => { const list = issued(a); const acc = list.filter(p => p.accessible).length;
            return <div key={a.id} className="eo-sub"><div className="k-between"><h4>{a.name} <span className="eo-muted">· {label(a.kind)}</span></h4><span className="eo-acts"><StatusChip s={a.status} />
              <FormDialog label="Permit" icon="ticket" title={`Issue permit — ${a.name}`} sub="Capacity is counted for overlapping times under the area lock." disabledReason={dr ?? (a.status !== "active" ? "This area is closed." : null)} action={cmd.bind(null, "permit", a.id, {})} submitLabel="Issue permit" fields={[
                { name: "holder_kind", label: "Holder", type: "select", required: true, options: ["staff", "supplier", "talent", "guest", "vip", "accessible", "other"].map(k => [k, label(k)]) }, { name: "holder_name", label: "Name", required: true },
                { name: "vehicle_reg", label: "Vehicle registration", placeholder: "e.g. AB12CDE" }, { name: "accessible", label: "Accessible space", type: "checkbox", hint: "Blue badge / accessible bay" },
                { name: "valid_from", label: "Valid from", type: "datetime", defaultValue: a.opens_at }, { name: "valid_to", label: "Valid to", type: "datetime", defaultValue: a.closes_at },
                { name: "party_id", label: "Partner", type: "select", options: partyOpts }, { name: "crew_id", label: "Crew member", type: "select", options: crewOpts }]} />
              <FormDialog label={`Edit ${a.name}`} icon="edit" variant="ghost" iconOnly title={`Edit parking — ${a.name}`} disabledReason={dr} action={cmd.bind(null, "area", a.id, {})} fields={areaFields(a)} /></span></div>
              <p className="k-small">{list.length - acc}/{a.capacity - a.accessible_spaces} standard · {acc}/{a.accessible_spaces} accessible issued{a.opens_at ? ` · open ${time(a.opens_at)}–${time(a.closes_at)}` : ""}</p>
              {list.length > 0 && <ul className="eo-list tight">{list.slice(0, 8).map(pm => <li key={pm.id}><span className="k-grow"><b>{pm.holder_name}</b><small>{pm.code}{pm.vehicle_reg ? ` · ${pm.vehicle_reg}` : ""}{pm.accessible ? " · accessible" : ""} · {span(pm.valid_from, pm.valid_to)}</small></span>
                <FormDialog label={`Revoke ${pm.code}`} icon="ban" variant="ghost" iconOnly title={`Revoke permit ${pm.code}`} submitLabel="Revoke" disabledReason={dr} action={cmd.bind(null, "revoke", pm.id, {})} fields={[{ name: "note", label: "Reason (required)", type: "textarea", required: true, maxLength: 300 }]} /></li>)}
                {list.length > 8 && <li className="eo-muted">{list.length - 8} more permits</li>}</ul>}</div>; })
            : <p className="k-small eo-muted">No parking areas. Add staff, supplier, talent and accessible parking.</p>}</Card>
        <GettingThereCard eventId={ev} settings={(e.settings ?? {}) as Record<string, unknown>} moves={M} areas={A} disabledReason={dr} maps={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue_name, e.location].filter(Boolean).join(", "))}`} />
        <Card><div className="k-between"><h3 className="ov-h">Logistics tasks</h3><AddTaskButton eventId={ev} category="logistics" label="Add" /></div>
          {tasks.length ? <ul className="k-list" style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>{tasks.map(t => <li key={t.id} className="k-li"><TaskCheck eventId={ev} taskId={t.id} done={t.status === "done"} title={t.title} /><span className="k-grow k-small" style={{ textDecoration: t.status === "done" ? "line-through" : undefined }}>{t.title}</span>{t.due_at && <span className="k-xs eo-muted">{dateShort(t.due_at)}</span>}</li>)}</ul>
            : <p className="k-small eo-muted">No logistics tasks — power, fencing, deliveries and load-in to-dos go here.</p>}</Card>
      </div>
    </div>
  </div>;
}
