import { requestTime } from "@/lib/workspace/format";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { House, ClipboardCheck, CalendarDays, Mic2, Ticket } from "lucide-react";
import { PortalShell, PortalPanel, PortalChip, type ChipTone } from "@/components/portal/shell";
import { requireUser } from "@/lib/auth";
import { untyped, isUuid } from "@/lib/workspace/db";
import { dateShort, time, money } from "@/lib/format";
import { partyPortalCommand } from "@/lib/actions/party-portal";
import { FormDialog, ActionButton, type FieldOption } from "@/components/organizer/event/sections/ops-forms-client";

export const metadata: Metadata = { title: "Partner portal", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Portal = { id: string; kind: string; name: string; status: string; event: { id: string; name: string; starts_at: string | null }; package: { name?: string; price?: number; currency?: string; benefits?: { title: string; quantity: number }[] } | null;
  contract_status: string | null; deliverables: { id: string; title: string; owed_by: string; due_at: string | null; status: string }[]; slots: { title: string; starts_at: string; minutes: number; role: string; status: string }[];
  booths: { code: string; name: string }[]; passes: number; riders: { id: string; kind: string; version: number; status: string; note: string }[] };
type Travel = { my_transport: { from: string; to: string; pickup: string; departs_at: string; arrives_at: string; status: string }[]; my_rooms: { hotel: string; address: string; nights_from: string; nights_to: string; status: string }[];
  my_parking: { area: string; code: string; valid_from: string; valid_to: string; access_route: string }[] };

const VIEWS = ["overview", "deliverables", "schedule", "riders", "passes"] as const;
type View = typeof VIEWS[number];
const TONE: Record<string, ChipTone> = { approved: "green", accepted: "green", confirmed: "green", issued: "green", signed: "green", submitted: "blue", in_progress: "blue", pending: "amber", requested: "amber", tentative: "amber",
  partially_issued: "amber", changes_requested: "amber", rejected: "red", cancelled: "grey", superseded: "grey", waived: "purple", negotiating: "blue", prospect: "grey", completed: "green", held: "amber" };
const lab = (s: string) => s.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
const chip = (s: string) => <PortalChip tone={TONE[s] ?? "grey"} dot>{lab(s)}</PortalChip>;
const RIDER_CATS: FieldOption[] = ["backline", "audio", "lighting", "video", "power", "staging", "dressing_room", "catering", "drinks", "accommodation", "ground_transport", "flights", "parking", "guest_list", "security", "other"].map(k => [k, lab(k)]);
const TALENT = ["artist", "speaker", "performer", "host"];

export default async function PartyPortalPage(props: PageProps<"/portal/parties/[id]">) {
  const { id } = await props.params; const sp = await props.searchParams;
  // Auth first (redirects to /login?next=…), then a uniform 404 for anything that isn't the caller's own party.
  const { supabase, user } = await requireUser(`/portal/parties/${id}`);
  if (!isUuid(id)) notFound();
  const sb = untyped(supabase);
  const { data: mine } = await sb.rpc("my_party_portal");
  const all = (mine ?? []) as Portal[]; const p = all.find(x => x.id === id);
  if (!p) notFound();
  const view: View = VIEWS.includes(sp.view as View) ? sp.view as View : "overview";
  const [{ data: ev }, { data: reqs }, { data: items }, { data: travel }, { data: profile }] = await Promise.all([
    sb.from("event_deliverable_evidence").select("id,deliverable_id,kind,url,note,at").in("deliverable_id", p.deliverables.map(d => d.id).length ? p.deliverables.map(d => d.id) : ["00000000-0000-0000-0000-000000000000"]).order("at"),
    sb.from("event_party_pass_requests").select("id,pass_type,quantity,status,issued_pass_ids,valid_from,valid_to").eq("party_id", p.id).order("created_at"),
    sb.from("talent_rider_items").select("id,rider_id,category,description,quantity,required,fulfilment_status").in("rider_id", p.riders.map(r => r.id).length ? p.riders.map(r => r.id) : ["00000000-0000-0000-0000-000000000000"]).order("sort"),
    sb.rpc("my_event_travel", { p_event: p.event.id }),
    sb.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  const EV = (ev ?? []) as { id: number; deliverable_id: string; kind: string; url: string | null; note: string; at: string }[];
  const Q = (reqs ?? []) as { id: string; pass_type: string; quantity: number; status: string; issued_pass_ids: string[]; valid_from: string | null; valid_to: string | null }[];
  const IT = (items ?? []) as { id: string; rider_id: string; category: string; description: string; quantity: number; required: boolean; fulfilment_status: string }[];
  const T = (travel ?? { my_transport: [], my_rooms: [], my_parking: [] }) as Travel;
  const base = `/portal/parties/${p.id}`; const href = (v: View) => v === "overview" ? base : `${base}?view=${v}`;
  const cmd = partyPortalCommand.bind(null, p.id);
  const now = requestTime(); const talent = TALENT.includes(p.kind);
  const open = p.deliverables.filter(d => d.owed_by === "party" && !["approved", "waived"].includes(d.status));
  const name = (profile as { full_name?: string } | null)?.full_name || user.email || "Partner";

  const deliverables = <PortalPanel title="Deliverables" extra={<small className="eo-muted">{p.deliverables.filter(d => ["approved", "waived"].includes(d.status)).length}/{p.deliverables.length} done</small>}>
    {p.deliverables.length ? <ul className="eo-list pp-list">{p.deliverables.map(d => { const evs = EV.filter(x => x.deliverable_id === d.id); const over = d.due_at && Date.parse(d.due_at) < now && !["approved", "waived"].includes(d.status);
      return <li key={d.id}><span className="k-grow"><b>{d.title}</b><small>{d.owed_by === "party" ? "From you" : "From the organiser"}{d.due_at ? ` · due ${dateShort(d.due_at)}` : ""}{over ? " · overdue" : ""}{evs.length ? ` · ${evs.length} evidence item(s)` : ""}</small>
        {evs.length > 0 && <ul className="eo-ev">{evs.map(x => <li key={x.id}>{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer nofollow">Link</a> : null}{x.note && <span>{x.note}</span>}</li>)}</ul>}</span>{chip(d.status)}
        {d.owed_by === "party" && !["approved", "waived", "submitted"].includes(d.status) && <span className="eo-acts">
          <FormDialog label="Add evidence" icon="upload" variant="ghost" title={`Evidence — ${d.title}`} sub="Share an https:// link to the file or proof, and/or a note." action={cmd.bind(null, "evidence", d.id)} fields={[{ name: "url", label: "Link (https://)", type: "url" }, { name: "note", label: "Note", type: "textarea", maxLength: 1000 }]} />
          <ActionButton label="Submit" icon="send" variant="primary" confirm={{ title: `Submit “${d.title}” for approval?` }} action={cmd.bind(null, "submit", d.id, {})} /></span>}</li>; })}</ul>
      : <p className="pt-empty">No deliverables on your agreement yet.</p>}</PortalPanel>;
  const schedule = <PortalPanel title={talent ? "Your schedule" : "Your booth"}>
    {talent ? (p.slots.length ? <ul className="eo-list pp-list">{p.slots.map((s, i) => <li key={i}><span className="k-grow"><b>{s.title}</b><small>{dateShort(s.starts_at)} {time(s.starts_at)} · {s.minutes} min · {lab(s.role)}</small></span>{chip(s.status)}</li>)}</ul> : <p className="pt-empty">You&apos;re not on the programme yet — the organiser will add your slot.</p>)
      : (p.booths.length ? <ul className="eo-list pp-list">{p.booths.map(b => <li key={b.code}><span className="k-grow"><b>Booth {b.code}</b><small>{b.name || "Exhibition floor"}</small></span></li>)}</ul> : <p className="pt-empty">No booth allocated yet.</p>)}
    {(T.my_transport.length > 0 || T.my_rooms.length > 0 || T.my_parking.length > 0) && <><h3 className="pp-h">Travel &amp; arrival</h3><ul className="eo-list pp-list">
      {T.my_transport.map((m, i) => <li key={`t${i}`}><span className="k-grow"><b>{m.from || "Pickup"} → {m.to || "Venue"}</b><small>{dateShort(m.departs_at)} {time(m.departs_at)}{m.pickup ? ` · pickup ${m.pickup}` : ""}</small></span>{chip(m.status)}</li>)}
      {T.my_rooms.map((r, i) => <li key={`r${i}`}><span className="k-grow"><b>{r.hotel}</b><small>{dateShort(r.nights_from)} – {dateShort(r.nights_to)}{r.address ? ` · ${r.address}` : ""}</small></span>{chip(r.status)}</li>)}
      {T.my_parking.map((m, i) => <li key={`p${i}`}><span className="k-grow"><b>Parking · {m.area}</b><small>Permit {m.code} · {dateShort(m.valid_from)} {time(m.valid_from)}–{time(m.valid_to)}{m.access_route ? ` · ${m.access_route}` : ""}</small></span></li>)}</ul></>}</PortalPanel>;
  const riders = <PortalPanel title="Riders" extra={talent && !["completed"].includes(p.status) ? <FormDialog label="Send a rider" icon="plus" variant="primary" wide title="Send a rider" sub="Each submission is a new version; the organiser accepts it or asks for changes. Submitted riders can't be edited." action={cmd.bind(null, "rider", null)} submitLabel="Send rider" fields={[
      { name: "kind", label: "Rider", type: "select", required: true, options: [["technical", "Technical"], ["hospitality", "Hospitality"], ["travel", "Travel"]] }, { name: "summary", label: "Summary", type: "textarea" },
      { name: "items", label: "Items", type: "rows", maxRows: 200, defaultValue: [{ category: "audio", description: "", quantity: 1, required: true }], columns: [{ name: "category", label: "Category", type: "select", required: true, options: RIDER_CATS }, { name: "description", label: "Description", required: true }, { name: "quantity", label: "Qty", type: "number", min: 1, defaultValue: 1 }, { name: "required", label: "Required", type: "checkbox", defaultValue: true, hint: "Required" }] }]} /> : undefined}>
    {!talent ? <p className="pt-empty">Riders are for artists, speakers, performers and hosts.</p> : p.riders.length ? p.riders.map(r => <div key={r.id} className={`eo-rider ${r.status === "superseded" ? "old" : ""}`}><div className="k-between"><b>{lab(r.kind)} rider v{r.version}</b>{chip(r.status)}</div>
      {r.note && <p className="k-small">Organiser: “{r.note}”</p>}
      {r.status !== "superseded" && <ul className="eo-list tight">{IT.filter(i => i.rider_id === r.id).map(i => <li key={i.id}><span className="k-grow"><b>{i.quantity} × {i.description}</b><small>{lab(i.category)}{i.required ? " · required" : ""}</small></span>{r.status === "accepted" && chip(i.fulfilment_status)}</li>)}</ul>}</div>)
      : <p className="pt-empty">No riders sent yet.</p>}</PortalPanel>;
  const passes = <PortalPanel title="Passes"><p className="k-small">{p.passes} pass(es) issued to your team. Pass holders receive their own passes from the organiser.</p>
    {Q.length ? <ul className="eo-list pp-list">{Q.map(q => <li key={q.id}><span className="k-grow"><b>{q.quantity} × {lab(q.pass_type)}</b><small>{q.issued_pass_ids.length} issued{q.valid_from ? ` · valid ${dateShort(q.valid_from)}` : ""}</small></span>{chip(q.status)}</li>)}</ul> : <p className="pt-empty">No pass allocations yet.</p>}</PortalPanel>;

  return <PortalShell portal={{ title: p.name, subtitle: lab(p.kind), thumb: "/brand/gala-dock-mark.png" }}
    context={{ label: p.event.name, thumb: "/brand/gala-dock-mark.png", menu: all.length > 1 ? all.map(x => ({ href: `/portal/parties/${x.id}`, label: `${x.event.name} · ${x.name}`, active: x.id === p.id })) : undefined }}
    nav={[{ href: href("overview"), label: "Overview", icon: House, active: view === "overview" }, { href: href("deliverables"), label: "Deliverables", icon: ClipboardCheck, active: view === "deliverables", badge: open.length },
      { href: href("schedule"), label: talent ? "Schedule & travel" : "Booth & travel", icon: CalendarDays, active: view === "schedule" }, ...(talent ? [{ href: href("riders"), label: "Riders", icon: Mic2, active: view === "riders" }] : []),
      { href: href("passes"), label: "Passes", icon: Ticket, active: view === "passes" }]}
    user={{ name, detail: user.email ?? "", avatar: (profile as { avatar_url?: string } | null)?.avatar_url, signOut: true }}
    links={{ messages: "/account/inbox", notifications: href("deliverables"), notificationsUnread: open.length, help: "/help" }} searchPlaceholder="Search this page…">
    <div className="pp">
      <header className="pp-head"><div><h1>{p.event.name}</h1><p>{p.name} · {lab(p.kind)}{p.event.starts_at ? ` · ${dateShort(p.event.starts_at)} ${time(p.event.starts_at)}` : ""}</p></div>{chip(p.status)}</header>
      {view === "overview" && <>
        <div className="pp-grid">
          <PortalPanel title="Your agreement"><ul className="eo-facts">
            <li><span>Status</span><b>{lab(p.status)}</b></li><li><span>Contract</span><b>{p.contract_status ? lab(p.contract_status) : "Not issued yet"}</b></li>
            {p.package?.name && <li><span>Package</span><b>{p.package.name}{p.package.price != null ? ` · ${money(p.package.price, p.package.currency ?? "GBP")}` : ""}</b></li>}</ul>
            {!!p.package?.benefits?.length && <><h3 className="pp-h">Included</h3><ul className="eo-list tight">{p.package.benefits.map((b, i) => <li key={i}><span className="k-grow k-small">{b.quantity > 1 ? `${b.quantity} × ` : ""}{b.title}</span></li>)}</ul></>}</PortalPanel>
          <PortalPanel title="To do" action={{ href: href("deliverables"), label: "All deliverables" }}>{open.length ? <ul className="eo-list pp-list">{open.slice(0, 5).map(d => <li key={d.id}><span className="k-grow"><b>{d.title}</b><small>{d.due_at ? `Due ${dateShort(d.due_at)}` : "No due date"}</small></span>{chip(d.status)}</li>)}</ul> : <p className="pt-empty">Nothing waiting on you.</p>}</PortalPanel>
        </div>
        {schedule}</>}
      {view === "deliverables" && deliverables}
      {view === "schedule" && schedule}
      {view === "riders" && riders}
      {view === "passes" && passes}
    </div>
  </PortalShell>;
}
