import { requestTime } from "@/lib/workspace/format";
import Link from "next/link";
import { Handshake, Package, Store, Ticket, ClipboardCheck, Mic2, FileSignature, ExternalLink } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { money, dateShort, time } from "@/lib/format";
import { partnersCommand } from "@/lib/actions/partners";
import type { SectionProps } from "./types";
import { PartyLogo } from "./party-logo";
import { FormDialog, ActionButton, type Field, type FieldOption } from "./ops-forms-client";
import { canManage, VIEW_ONLY, ViewOnly, ChecksCard, Stat, StatusChip, label, opsItems } from "./ops-shared";

type Party = { id: string; kind: string; name: string; logo_url?: string | null; status: string; client_id: string | null; talent_profile_id: string | null; package_id: string | null; package_snapshot: { name?: string; price?: number; version?: number } | null;
  contract_id: string | null; fee: number; currency: string; contact_name: string; contact_email: string; contact_phone: string; portal_user_id: string | null; arrival_buffer_minutes: number; notes: string; status_reason: string; version: number };
type Benefit = { id: string; kind: string; title: string; quantity: number; pass_type: string | null; owed_by: string; due_days_before: number | null; evidence_required: boolean; sort: number };
type Pkg = { id: string; kind: string; name: string; tier: string; description: string; price: number; currency: string; quantity: number | null; status: string; version: number; event_package_benefits: Benefit[] };
type Evidence = { id: number; kind: string; url: string | null; note: string; at: string };
type Deliv = { id: string; party_id: string; title: string; kind: string; owed_by: string; due_at: string | null; status: string; evidence_required: boolean; decision_note: string; event_deliverable_evidence: Evidence[] };
type Booth = { id: string; code: string; name: string; package_id: string | null; width_m: number | null; depth_m: number | null; power_kw: number | null; price: number; venue_map_id: string | null; map_element_ref: string | null; zone_id: string | null; party_id: string | null; status: string };
type PassReq = { id: string; party_id: string; pass_type: string; quantity: number; zone_ids: string[]; valid_from: string | null; valid_to: string | null; source: string; status: string; issued_pass_ids: string[] };
type Slot = { id: string; party_id: string; role: string; status: string; note: string; programme_items: { title: string; starts_at: string; duration_minutes: number } | null };
type RiderItem = { id: string; category: string; description: string; quantity: number; required: boolean; fulfilment_status: string; fulfilment_note: string; sort: number };
type Rider = { id: string; party_id: string; kind: string; version: number; status: string; summary: string; decision_note: string; submitted_at: string | null; talent_rider_items: RiderItem[] };
type MoneyRow = { id: string; party_id: string; direction: string; amount: number; currency: string; invoice_id: string | null; payment_id: string | null; note: string };

const KINDS: FieldOption[] = [["sponsor", "Sponsor"], ["exhibitor", "Exhibitor"], ["artist", "Artist"], ["speaker", "Speaker"], ["performer", "Performer"], ["host", "Host"]];
const TALENT = ["artist", "speaker", "performer", "host"];
const NEXT: Record<string, string[]> = { prospect: ["negotiating", "confirmed", "withdrawn", "cancelled"], negotiating: ["prospect", "confirmed", "withdrawn", "cancelled"], confirmed: ["completed", "cancelled"] };
const D_NEXT: Record<string, string[]> = { pending: ["in_progress", "submitted", "waived"], in_progress: ["pending", "submitted", "waived"], submitted: ["approved", "rejected"], rejected: ["in_progress", "submitted", "waived"], waived: ["pending"] };
const BENEFIT_KINDS: FieldOption[] = ["logo_placement", "booth", "passes", "stage_mention", "speaking_slot", "social_post", "email_feature", "hospitality", "parking", "signage", "asset", "other"].map(k => [k, label(k)]);
const PASS_TYPES: FieldOption[] = ["guest", "staff", "supplier", "artist", "vip", "backstage", "press"].map(k => [k, label(k)]);
const RIDER_CATS: FieldOption[] = ["backline", "audio", "lighting", "video", "power", "staging", "dressing_room", "catering", "drinks", "accommodation", "ground_transport", "flights", "parking", "guest_list", "security", "other"].map(k => [k, label(k)]);

export async function PartnersSection({ e, d, role }: SectionProps) {
  const sb = untyped(await createClient());
  const ev = e.id; const ws = e.workspace_id as string;
  const [parties, pkgs, delivs, booths, passReqs, slots, riders, moneyRows, maps, zones, talent, clients, contracts, invoices, payments, checks] = await Promise.all([
    sb.from("event_parties").select("*").eq("event_id", ev).order("kind").order("name"),
    sb.from("event_party_packages").select("*, event_package_benefits(*)").eq("event_id", ev).neq("status", "retired").order("kind").order("price", { ascending: false }),
    sb.from("event_party_deliverables").select("*, event_deliverable_evidence(id,kind,url,note,at)").eq("event_id", ev).order("due_at", { ascending: true, nullsFirst: false }),
    sb.from("exhibitor_booths").select("*").eq("event_id", ev).neq("status", "retired").order("code"),
    sb.from("event_party_pass_requests").select("*").eq("event_id", ev).order("created_at"),
    sb.from("event_party_slots").select("*, programme_items(title,starts_at,duration_minutes)").eq("event_id", ev),
    sb.from("talent_riders").select("*, talent_rider_items(*)").eq("event_id", ev).order("kind").order("version", { ascending: false }),
    sb.from("event_party_money").select("*").eq("event_id", ev),
    sb.from("venue_maps").select("id,version,status").eq("event_id", ev).order("version", { ascending: false }),
    sb.from("access_zones").select("id,name").eq("event_id", ev).order("sort"),
    sb.from("talent_profiles").select("id,name,kind").eq("workspace_id", ws).eq("status", "active").order("name").limit(300),
    sb.from("clients").select("id,name").eq("workspace_id", ws).is("merged_into", null).order("name").limit(300),
    sb.from("contracts").select("id,title,number,status,event_id").eq("workspace_id", ws).or(`event_id.eq.${ev},event_id.is.null`).order("created_at", { ascending: false }).limit(100),
    sb.from("invoices").select("id,number,total,status,client_name").eq("workspace_id", ws).or(`event_id.eq.${ev},event_id.is.null`).order("created_at", { ascending: false }).limit(100),
    sb.from("payments").select("id,payee,amount,status,kind").eq("event_id", ev).limit(100),
    opsItems(ev, i => i.domain === "partners"),
  ]);
  const P = (parties.data ?? []) as Party[]; const K = (pkgs.data ?? []) as Pkg[]; const DL = (delivs.data ?? []) as Deliv[]; const B = (booths.data ?? []) as Booth[];
  const Q = (passReqs.data ?? []) as PassReq[]; const SL = (slots.data ?? []) as Slot[]; const R = (riders.data ?? []) as Rider[]; const M = (moneyRows.data ?? []) as MoneyRow[];
  const MAPS = (maps.data ?? []) as { id: string; version: number; status: string }[]; const Z = (zones.data ?? []) as { id: string; name: string }[];
  const CT = (contracts.data ?? []) as { id: string; title: string; number: string; status: string }[];
  const mgr = canManage(role); const dr = mgr ? null : VIEW_ONLY;
  const cmd = partnersCommand.bind(null, ev);
  const contractOf = (id: string | null) => CT.find(c => c.id === id);
  const allocated = (k: Pkg) => P.filter(p => p.package_id === k.id && ["confirmed", "completed"].includes(p.status)).length;
  const now = requestTime();
  const programme = d.programme.filter(p => p.kind === "programme").map(p => [p.id, `${dateShort(p.starts_at)} ${time(p.starts_at)} · ${p.title}`] as FieldOption);
  const zoneOpts = Z.map(z => [z.id, z.name] as FieldOption); const mapOpts = MAPS.map(m => [m.id, `Map v${m.version} (${m.status})`] as FieldOption);

  const partyFields = (p?: Party): Field[] => {
    const kind = p?.kind;
    const f: Field[] = [];
    if (!p) f.push({ name: "kind", label: "Kind", type: "select", options: KINDS, required: true });
    f.push({ name: "name", label: "Name", required: true, maxLength: 160, defaultValue: p?.name });
    if (!kind || ["sponsor", "exhibitor"].includes(kind)) {
      f.push({ name: "client_id", label: "CRM client (sponsor / exhibitor)", type: "select", options: (clients.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name] as FieldOption), defaultValue: p?.client_id });
      f.push({ name: "package_id", label: "Package", type: "select", options: K.filter(k => k.status === "active" && (!kind || (kind === "sponsor" ? k.kind === "sponsorship" : k.kind === "exhibitor"))).map(k => [k.id, `${k.name} · ${label(k.kind)} · ${money(k.price, k.currency)}`] as FieldOption), defaultValue: p?.package_id, hint: p && ["confirmed", "completed"].includes(p.status) ? "Locked after confirmation." : "Sponsors take sponsorship packages; exhibitors take exhibitor packages." });
    }
    if (!kind || TALENT.includes(kind)) f.push({ name: "talent_profile_id", label: "Talent profile (artist / speaker / performer / host)", type: "select", options: (talent.data ?? []).map((t: { id: string; name: string; kind: string }) => [t.id, `${t.name} (${t.kind})`] as FieldOption), defaultValue: p?.talent_profile_id, hint: "Used for double-booking and blackout checks across your events." });
    f.push({ name: "fee", label: "Fee (talent) / agreed amount", type: "number", min: 0, defaultValue: p?.fee ?? "" },
      { name: "arrival_buffer_minutes", label: "Arrival buffer (minutes before slot)", type: "number", min: 0, max: 1440, defaultValue: p?.arrival_buffer_minutes ?? 60 },
      { name: "contact_name", label: "Contact name", defaultValue: p?.contact_name }, { name: "contact_email", label: "Contact email", type: "email", defaultValue: p?.contact_email },
      { name: "contact_phone", label: "Contact phone", defaultValue: p?.contact_phone }, { name: "notes", label: "Notes", type: "textarea", defaultValue: p?.notes });
    return f;
  };
  const pkgFields = (k?: Pkg): Field[] => [
    ...(k ? [] : [{ name: "kind", label: "Kind", type: "select", options: [["sponsorship", "Sponsorship"], ["exhibitor", "Exhibitor"]], required: true } as Field]),
    { name: "name", label: "Name", required: true, defaultValue: k?.name }, { name: "tier", label: "Tier", defaultValue: k?.tier, placeholder: "e.g. Gold" },
    { name: "price", label: "Price", type: "number", min: 0, defaultValue: k?.price ?? 0 }, { name: "quantity", label: "Quantity for sale (blank = unlimited)", type: "number", min: 1, defaultValue: k?.quantity ?? "" },
    ...(k ? [{ name: "status", label: "Status", type: "select", options: [["active", "Active"], ["draft", "Draft"], ["retired", "Retired"]], required: true, defaultValue: k.status } as Field] : []),
    { name: "description", label: "Description", type: "textarea", defaultValue: k?.description },
    { name: "benefits", label: "Benefits", type: "rows", maxRows: 50, hint: "Confirming a partner snapshots these and creates one deliverable per benefit (passes become pass requests).", defaultValue: (k?.event_package_benefits ?? []).sort((a, b) => a.sort - b.sort).map(b => ({ ...b, pass_type: b.pass_type ?? "", due_days_before: b.due_days_before ?? "" })),
      columns: [{ name: "kind", label: "Kind", type: "select", options: BENEFIT_KINDS, required: true }, { name: "title", label: "Title", required: true }, { name: "quantity", label: "Qty", type: "number", min: 1, defaultValue: 1 },
        { name: "pass_type", label: "Pass type", type: "select", options: PASS_TYPES }, { name: "owed_by", label: "Owed by", type: "select", options: [["organizer", "Us"], ["party", "Partner"]], required: true },
        { name: "due_days_before", label: "Due (days before)", type: "number", min: 0, max: 365 }, { name: "evidence_required", label: "Evidence", type: "checkbox", defaultValue: true, hint: "Required" }] },
  ];
  const boothFields = (b?: Booth): Field[] => [
    { name: "code", label: "Code", required: true, defaultValue: b?.code, placeholder: "e.g. A1" }, { name: "name", label: "Name", defaultValue: b?.name },
    { name: "package_id", label: "Exhibitor package", type: "select", options: K.filter(k => k.kind === "exhibitor").map(k => [k.id, k.name] as FieldOption), defaultValue: b?.package_id },
    { name: "price", label: "Price", type: "number", min: 0, defaultValue: b?.price ?? 0 },
    { name: "width_m", label: "Width (m)", type: "number", min: 0, defaultValue: b?.width_m ?? "" }, { name: "depth_m", label: "Depth (m)", type: "number", min: 0, defaultValue: b?.depth_m ?? "" },
    { name: "power_kw", label: "Power (kW)", type: "number", min: 0, defaultValue: b?.power_kw ?? "" },
    { name: "venue_map_id", label: "Event map", type: "select", options: mapOpts, defaultValue: b?.venue_map_id ?? MAPS[0]?.id, hint: MAPS.length ? undefined : "No event map yet — create one in Floor & Map to place booths." },
    { name: "map_element_ref", label: "Map element id", defaultValue: b?.map_element_ref ?? "", hint: "The booth element's id from the map editor; one booth per element." },
    { name: "zone_id", label: "Access zone (added to exhibitor passes)", type: "select", options: zoneOpts, defaultValue: b?.zone_id },
    ...(b && !b.party_id ? [{ name: "status", label: "Status", type: "select", options: [["available", "Available"], ["blocked", "Blocked"], ["retired", "Retired"]], required: true, defaultValue: b.status } as Field] : []),
  ];

  // ── Stats ──
  const confirmed = P.filter(p => p.status === "confirmed").length;
  const dTotal = DL.length, dDone = DL.filter(x => ["approved", "waived"].includes(x.status)).length, dOver = DL.filter(x => !["approved", "waived"].includes(x.status) && x.due_at && Date.parse(x.due_at) < now).length;
  const pReq = Q.filter(q => q.status !== "cancelled").reduce((a, q) => a + q.quantity, 0), pIss = Q.reduce((a, q) => a + q.issued_pass_ids.length, 0);
  const ridersWaiting = R.filter(r => r.status === "submitted").length;
  const groups: [string, string[]][] = [["Sponsors", ["sponsor"]], ["Exhibitors", ["exhibitor"]], ["Talent — artists & performers", ["artist", "performer"]], ["Talent — speakers & hosts", ["speaker", "host"]]];

  const deliverables = (p: Party) => { const list = DL.filter(x => x.party_id === p.id);
    return <div className="eo-sub"><div className="k-between"><h4>Deliverables</h4>
      <FormDialog label="Add" icon="plus" title={`Add deliverable — ${p.name}`} disabledReason={dr} action={cmd.bind(null, "deliverable", null, { party: p.id })} fields={[
        { name: "title", label: "Title", required: true }, { name: "owed_by", label: "Owed by", type: "select", options: [["organizer", "Us (organiser)"], ["party", "The partner"]], required: true },
        { name: "due_at", label: "Due", type: "datetime" }, { name: "evidence_required", label: "Evidence", type: "checkbox", defaultValue: true, hint: "Evidence required before submission" }]} /></div>
      {list.length ? <table className="k-table eo-table"><thead><tr><th>Deliverable</th><th>Owed by</th><th>Due</th><th>Evidence</th><th>Status</th><th><span className="k-sr">Actions</span></th></tr></thead><tbody>{list.map(x => {
        const over = !["approved", "waived"].includes(x.status) && x.due_at && Date.parse(x.due_at) < now;
        return <tr key={x.id}><td><b>{x.title}</b>{x.decision_note && <small className="eo-block">“{x.decision_note}”</small>}</td><td>{x.owed_by === "party" ? "Partner" : "Us"}</td>
          <td className={over ? "k-red" : ""}>{x.due_at ? dateShort(x.due_at) : "—"}{over && <small className="eo-block">Overdue</small>}</td>
          <td>{x.event_deliverable_evidence.length ? <ul className="eo-ev">{x.event_deliverable_evidence.map(v => <li key={v.id}>{v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer nofollow">Link <ExternalLink size={11} /></a> : null}{v.note && <span>{v.note}</span>}</li>)}</ul> : x.evidence_required ? <span className="eo-muted">Required</span> : <span className="eo-muted">Optional</span>}</td>
          <td><StatusChip s={x.status} /></td>
          <td><span className="eo-acts">{!["approved", "waived"].includes(x.status) && <FormDialog label="Evidence" icon="upload" variant="ghost" title="Add evidence" sub="An https:// link (proof of placement, uploaded asset) and/or a note." disabledReason={dr} action={cmd.bind(null, "evidence", x.id, {})} fields={[{ name: "url", label: "Link (https://)", type: "url" }, { name: "note", label: "Note", type: "textarea", maxLength: 1000 }]} />}
            {(D_NEXT[x.status] ?? []).map(to => ["rejected", "waived"].includes(to)
              ? <FormDialog key={to} label={label(to)} icon={to === "rejected" ? "x" : "ban"} variant="ghost" title={`${label(to)} — ${x.title}`} submitLabel={label(to)} disabledReason={dr} action={cmd.bind(null, "deliverable_to", x.id, { to })} fields={[{ name: "note", label: "Reason (required)", type: "textarea", required: true }]} />
              : <ActionButton key={to} label={to === "approved" ? "Approve" : label(to)} icon={to === "approved" ? "check" : to === "submitted" ? "send" : "undo"} variant={to === "approved" ? "soft" : "ghost"} disabledReason={dr} action={cmd.bind(null, "deliverable_to", x.id, { to }, {})} />)}</span></td></tr>; })}</tbody></table>
        : <p className="k-small eo-muted">No deliverables. {p.package_id ? "Confirming the partner creates them from the package benefits." : "Add one, or attach a package."}</p>}</div>; };

  const passes = (p: Party) => { const list = Q.filter(q => q.party_id === p.id);
    return <div className="eo-sub"><div className="k-between"><h4>Pass requests</h4>
      <FormDialog label="Request" icon="ticket" title={`Pass request — ${p.name}`} disabledReason={dr} action={cmd.bind(null, "pass_request", p.id, {})} fields={[
        { name: "pass_type", label: "Pass type", type: "select", options: PASS_TYPES, required: true }, { name: "quantity", label: "Quantity", type: "number", min: 1, max: 500, required: true, defaultValue: 2 },
        { name: "zone_id", label: "Access zone", type: "select", options: zoneOpts, hint: Z.length ? undefined : "No access zones yet (Operations › Access & passes)." }, { name: "valid_from", label: "Valid from", type: "datetime", defaultValue: e.starts_at }, { name: "valid_to", label: "Valid to", type: "datetime", defaultValue: e.ends_at }]} /></div>
      {list.length ? <ul className="eo-list">{list.map(q => <li key={q.id}><span className="k-grow"><b>{q.quantity} × {label(q.pass_type)}</b><small>{q.issued_pass_ids.length} issued · {q.source === "package" ? "from package" : "manual"}{q.zone_ids.length ? ` · ${q.zone_ids.map(z => Z.find(x => x.id === z)?.name ?? "zone").join(", ")}` : ""}</small></span><StatusChip s={q.status} />
        {["requested", "partially_issued"].includes(q.status) && <><FormDialog label="Issue" icon="ticket" variant="soft" title={`Issue ${label(q.pass_type)} passes`} sub={`${q.quantity - q.issued_pass_ids.length} left on this request. Passes are created in Access & passes; holders are not emailed from here.`}
          disabledReason={dr ?? (p.status !== "confirmed" ? "Confirm the partner before issuing passes." : null)} action={cmd.bind(null, "issue", q.id, {})} submitLabel="Issue passes"
          fields={[{ name: "holders", label: "Holders", type: "rows", maxRows: Math.max(1, q.quantity - q.issued_pass_ids.length), defaultValue: [{ name: "", email: "" }], columns: [{ name: "name", label: "Name", required: true }, { name: "email", label: "Email", type: "email" }] }]} />
          <ActionButton label="Cancel" icon="ban" variant="ghost" disabledReason={dr} confirm={{ title: "Cancel this pass request?", message: "Passes already issued stay valid.", danger: true, confirmLabel: "Cancel request" }} action={cmd.bind(null, "pass_cancel", q.id, {}, {})} /></>}</li>)}</ul>
        : <p className="k-small eo-muted">No pass requests.</p>}</div>; };

  const booth = (p: Party) => { const mine = B.filter(b => b.party_id === p.id); const free = B.filter(b => b.status === "available");
    return <div className="eo-sub"><div className="k-between"><h4>Booth</h4>
      {free.length > 0 && <FormDialog label="Allocate" icon="plus" title={`Allocate a booth — ${p.name}`} disabledReason={dr ?? (["completed", "cancelled", "withdrawn"].includes(p.status) ? "This partner is closed." : null)} action={cmd.bind(null, "allocate", p.id, {})} fields={[
        { name: "booth", label: "Booth", type: "select", required: true, options: free.map(b => [b.id, `${b.code}${b.name ? ` · ${b.name}` : ""}${b.width_m && b.depth_m ? ` · ${b.width_m}×${b.depth_m} m` : ""}`] as FieldOption) },
        { name: "reserve_only", label: "Reserve only", type: "checkbox", hint: "Hold it without allocating yet" }]} />}</div>
      {mine.length ? <ul className="eo-list">{mine.map(b => <li key={b.id}><span className="k-grow"><b>{b.code}</b><small>{b.map_element_ref ? `Map element ${b.map_element_ref}` : "Not placed on the map"}{b.power_kw ? ` · ${b.power_kw} kW` : ""}</small></span><StatusChip s={b.status} />
        <ActionButton label="Release" icon="undo" variant="ghost" disabledReason={dr} confirm={{ title: `Release booth ${b.code}?`, danger: true }} action={cmd.bind(null, "release", b.id, {}, {})} /></li>)}</ul>
        : <p className="k-small eo-muted">{B.length ? (free.length ? "No booth allocated." : "No booth allocated — all booths are taken.") : "No booths set up yet — add them in the Booths panel."}</p>}</div>; };

  const talentPanel = (p: Party) => { const mine = SL.filter(s => s.party_id === p.id); const rs = R.filter(r => r.party_id === p.id);
    return <><div className="eo-sub"><div className="k-between"><h4>Programme slots</h4>
      <FormDialog label="Set slot" icon="calendar" title={`Programme slot — ${p.name}`} sub={p.talent_profile_id ? "Confirmed slots are checked against this talent's other confirmed slots and blackout dates." : "Link a talent profile to get double-booking checks."}
        disabledReason={dr ?? (programme.length ? null : "Add programme items first (Plan › Programme).")} action={cmd.bind(null, "slot", p.id, {})} fields={[
          { name: "item", label: "Programme item", type: "select", options: programme, required: true },
          { name: "role", label: "Role", type: "select", required: true, options: ["headline", "support", "performer", "speaker", "panelist", "host", "soundcheck", "other"].map(k => [k, label(k)] as FieldOption), defaultValue: p.kind === "speaker" ? "speaker" : p.kind === "host" ? "host" : "performer" },
          { name: "status", label: "Status", type: "select", required: true, options: [["tentative", "Tentative"], ["confirmed", "Confirmed"], ["cancelled", "Cancelled"]] }, { name: "note", label: "Note", type: "textarea", maxLength: 500 }]} /></div>
      {mine.length ? <ul className="eo-list">{mine.map(s => <li key={s.id}><span className="k-grow"><b>{s.programme_items?.title ?? "Programme item"}</b><small>{s.programme_items ? `${dateShort(s.programme_items.starts_at)} ${time(s.programme_items.starts_at)} · ${s.programme_items.duration_minutes} min · ${label(s.role)}` : label(s.role)}</small></span><StatusChip s={s.status} /></li>)}</ul>
        : <p className="k-small eo-muted">Not on the programme yet.</p>}</div>
    <div className="eo-sub"><div className="k-between"><h4>Riders</h4>
      <FormDialog label="Record rider" icon="plus" wide title={`New rider version — ${p.name}`} sub="Submitting a new version supersedes the pending one. Submitted riders are immutable." disabledReason={dr ?? (["completed", "cancelled", "withdrawn"].includes(p.status) ? "This partner is closed." : null)} action={cmd.bind(null, "rider", p.id, {})} submitLabel="Submit rider" fields={[
        { name: "kind", label: "Rider", type: "select", required: true, options: [["technical", "Technical"], ["hospitality", "Hospitality"], ["travel", "Travel"]] }, { name: "summary", label: "Summary", type: "textarea" },
        { name: "items", label: "Items", type: "rows", maxRows: 200, defaultValue: [{ category: "audio", description: "", quantity: 1, required: true }], columns: [{ name: "category", label: "Category", type: "select", options: RIDER_CATS, required: true }, { name: "description", label: "Description", required: true }, { name: "quantity", label: "Qty", type: "number", min: 1, defaultValue: 1 }, { name: "required", label: "Required", type: "checkbox", defaultValue: true, hint: "Required" }] }]} /></div>
      {rs.length ? rs.map(r => <div key={r.id} className={`eo-rider ${["superseded", "withdrawn"].includes(r.status) ? "old" : ""}`}><div className="k-between"><b>{label(r.kind)} rider v{r.version}</b><span className="eo-acts"><StatusChip s={r.status} />
        {r.status === "submitted" && <><ActionButton label="Accept" icon="check" variant="soft" disabledReason={dr} confirm={{ title: `Accept ${r.kind} rider v${r.version}?`, message: "Required items without carried-over fulfilment become event tasks." }} action={cmd.bind(null, "rider_decide", r.id, { decision: "accepted" }, {})} />
          <FormDialog label="Request changes" icon="undo" variant="ghost" title="Request rider changes" submitLabel="Send back" disabledReason={dr} action={cmd.bind(null, "rider_decide", r.id, { decision: "changes_requested" })} fields={[{ name: "note", label: "What needs to change (required)", type: "textarea", required: true }]} /></>}</span></div>
        {r.summary && <p className="k-small">{r.summary}</p>}{r.decision_note && <p className="k-small eo-muted">Decision note: “{r.decision_note}”</p>}
        {!["superseded", "withdrawn"].includes(r.status) && <ul className="eo-list tight">{[...r.talent_rider_items].sort((a, b) => a.sort - b.sort).map(i => <li key={i.id}><span className="k-grow"><b>{i.quantity} × {i.description}</b><small>{label(i.category)}{i.required ? " · required" : " · optional"}{i.fulfilment_note ? ` · ${i.fulfilment_note}` : ""}</small></span><StatusChip s={i.fulfilment_status} />
          {r.status === "accepted" && <FormDialog label="Fulfil" icon="check" variant="ghost" iconOnly title={`Fulfilment — ${i.description}`} disabledReason={dr} action={cmd.bind(null, "rider_fulfil", i.id, {})} fields={[{ name: "status", label: "Status", type: "select", required: true, defaultValue: i.fulfilment_status, options: [["pending", "Pending"], ["confirmed", "Confirmed"], ["substituted", "Substituted"], ["declined", "Declined"], ["not_needed", "Not needed"]] }, { name: "note", label: "Note", type: "textarea", maxLength: 500, defaultValue: i.fulfilment_note }]} />}</li>)}</ul>}</div>)
        : <p className="k-small eo-muted">No riders yet. The talent can submit through their portal login, or record one here.</p>}</div></>; };

  const moneyPanel = (p: Party) => { const mine = M.filter(m => m.party_id === p.id); const c = contractOf(p.contract_id);
    const linked = new Set(M.map(m => m.invoice_id ?? m.payment_id));
    const refs: FieldOption[] = [...(invoices.data ?? []).filter((i: { id: string }) => !linked.has(i.id)).map((i: { id: string; number: string; total: number; status: string; client_name: string }) => [`inv:${i.id}`, `Invoice ${i.number} · ${i.client_name} · ${money(i.total)} (${i.status})`] as FieldOption),
      ...(payments.data ?? []).filter((y: { id: string }) => !linked.has(y.id)).map((y: { id: string; payee: string; amount: number; status: string }) => [`pay:${y.id}`, `Payment · ${y.payee || "supplier"} · ${money(y.amount)} (${y.status})`] as FieldOption)];
    return <div className="eo-sub"><div className="k-between"><h4>Contract &amp; money</h4></div>
      <div className="eo-kv"><span>Contract</span>{c ? <span className="eo-acts"><Link className="k-link" href={`/organizer/sales/contracts/${c.id}`}>{c.number || c.title}</Link><StatusChip s={c.status} /></span> : <span className="eo-acts"><span className="eo-muted">None</span>
        <FormDialog label="Create draft" icon="sign" variant="ghost" title={`Contract — ${p.name}`} sub="Creates a draft in the contracts engine with the package / fee value." disabledReason={dr} action={cmd.bind(null, "contract_create", p.id, {})} submitLabel="Create draft" fields={[{ name: "title", label: "Title (optional)", placeholder: `${label(p.kind)} agreement — ${p.name}` }]} />
        {CT.length > 0 && <FormDialog label="Link existing" icon="link" variant="ghost" title="Link a contract" disabledReason={dr} action={cmd.bind(null, "contract_link", p.id, {})} fields={[{ name: "contract", label: "Contract", type: "select", required: true, options: CT.map(x => [x.id, `${x.number || "Draft"} · ${x.title} (${x.status})`] as FieldOption) }]} />}</span>}</div>
      {["owner", "admin", "manager", "finance"].includes(role) ? <>{mine.map(m => <div key={m.id} className="eo-kv"><span>{m.direction === "receivable" ? "Receivable" : "Payable"}</span><span>{money(m.amount, m.currency)}{m.note ? ` · ${m.note}` : ""}</span></div>)}
        <FormDialog label="Link invoice / payment" icon="link" variant="ghost" title={`Link money — ${p.name}`} sub="Reference only: invoices and payments keep their own behaviour." disabledReason={dr ?? (refs.length ? null : "No unlinked invoices or event payments to link.")} action={cmd.bind(null, "money", p.id, {})} fields={[
          { name: "direction", label: "Direction", type: "select", required: true, options: [["receivable", "Receivable (they pay us)"], ["payable", "Payable (we pay them)"]], defaultValue: TALENT.includes(p.kind) ? "payable" : "receivable" },
          { name: "ref", label: "Invoice or payment", type: "select", required: true, options: refs }, { name: "amount", label: "Amount (blank = full)", type: "number", min: 0 }, { name: "note", label: "Note", maxLength: 300 }]} /></>
        : <p className="k-small eo-muted">Money links are visible to owners, managers and finance.</p>}</div>; };

  const portal = (p: Party) => <div className="eo-kv"><span>Portal login</span>{p.portal_user_id ? <span className="eo-acts"><Chip tone="green">Linked</Chip><ActionButton label="Remove access" icon="ban" variant="ghost" disabledReason={dr} confirm={{ title: `Remove ${p.name}'s portal access?`, danger: true, confirmLabel: "Remove" }} action={cmd.bind(null, "unportal", p.id, {}, {})} /></span>
    : <span className="eo-acts"><span className="eo-muted">Not linked</span><FormDialog label="Link login" icon="key" variant="ghost" title={`Portal access — ${p.name}`} sub="They must already have a Gala Dock login. They'll see only this partner's agreement, deliverables, slots, booth, passes and riders at /portal/parties/…" disabledReason={dr ?? (["cancelled", "withdrawn"].includes(p.status) ? "Closed partners can't use the portal." : null)} action={cmd.bind(null, "portal", p.id, {})} submitLabel="Link" fields={[{ name: "email", label: "Their login email", type: "email", required: true, defaultValue: p.contact_email }]} /></span>}</div>;

  const row = (p: Party) => { const ds = DL.filter(x => x.party_id === p.id); const bo = B.filter(b => b.party_id === p.id); const q = Q.filter(x => x.party_id === p.id && x.status !== "cancelled"); const c = contractOf(p.contract_id);
    const over = ds.filter(x => !["approved", "waived"].includes(x.status) && x.due_at && Date.parse(x.due_at) < now).length;
    return <details key={p.id} className="eo-party" id={`party-${p.id}`}>
      <summary><span className="eo-pn"><b>{p.name}</b><small>{label(p.kind)}{p.package_snapshot?.name ? ` · ${p.package_snapshot.name}` : p.package_id ? ` · ${K.find(k => k.id === p.package_id)?.name ?? "package"}` : ""}</small></span>
        <StatusChip s={p.status} /><span className="eo-pm">{c ? `Contract ${c.status}` : "No contract"}</span><span className={`eo-pm ${over ? "k-red" : ""}`}>{ds.length ? `${ds.filter(x => ["approved", "waived"].includes(x.status)).length}/${ds.length} deliverables${over ? ` · ${over} overdue` : ""}` : "No deliverables"}</span>
        <span className="eo-pm">{["sponsor", "exhibitor"].includes(p.kind) ? (bo[0] ? `Booth ${bo[0].code}` : "No booth") : `${SL.filter(s => s.party_id === p.id && s.status !== "cancelled").length} slot(s)`}</span><span className="eo-pm">{q.reduce((a, x) => a + x.issued_pass_ids.length, 0)}/{q.reduce((a, x) => a + x.quantity, 0)} passes</span></summary>
      <div className="eo-party-body">
        {["sponsor", "exhibitor"].includes(p.kind) && <PartyLogo partyId={p.id} workspaceId={ws} name={p.name} logo={p.logo_url ?? null} disabledReason={dr} />}
        <div className="eo-acts eo-party-acts">
          <FormDialog label="Edit" icon="edit" title={`Edit ${p.name}`} sub={`Version ${p.version}. If someone else saves first you'll be asked to refresh.`} disabledReason={dr} action={cmd.bind(null, "party", p.id, { version: p.version })} fields={partyFields(p)} />
          {(NEXT[p.status] ?? []).map(to => ["cancelled", "withdrawn"].includes(to)
            ? <FormDialog key={to} label={label(to)} icon="ban" variant="ghost" title={`${label(to)} — ${p.name}`} sub="Releases booths and cancels pending pass requests and slots." submitLabel={label(to)} disabledReason={dr} action={cmd.bind(null, "transition", p.id, { to, from: p.status })} fields={[{ name: "note", label: "Reason (required)", type: "textarea", required: true }]} />
            : <ActionButton key={to} label={to === "confirmed" ? "Confirm" : to === "completed" ? "Mark completed" : `Move to ${to}`} icon={to === "confirmed" ? "check" : "swap"} variant={to === "confirmed" ? "primary" : "outline"} disabledReason={dr}
              confirm={to === "confirmed" ? { title: `Confirm ${p.name}?`, message: p.package_id ? "Allocates the package (refused when sold out), snapshots it and creates deliverables and pass requests." : "Marks the partner confirmed." } : undefined}
              action={cmd.bind(null, "transition", p.id, { to, from: p.status }, {})} />)}
          {p.status_reason && <small className="eo-muted">Last reason: {p.status_reason}</small>}</div>
        <div className="eo-party-grid">
          <div className="eo-sub"><h4>Details</h4>
            <div className="eo-kv"><span>Contact</span><span>{[p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(" · ") || "—"}</span></div>
            {TALENT.includes(p.kind) && <div className="eo-kv"><span>Fee</span><span>{money(p.fee, p.currency)}</span></div>}
            {p.package_snapshot && <div className="eo-kv"><span>Deal snapshot</span><span>{p.package_snapshot.name} · {money(Number(p.package_snapshot.price ?? 0), p.currency)} (package v{p.package_snapshot.version})</span></div>}
            {portal(p)}{p.notes && <p className="k-small">{p.notes}</p>}</div>
          {moneyPanel(p)}{deliverables(p)}{passes(p)}{["sponsor", "exhibitor"].includes(p.kind) ? booth(p) : talentPanel(p)}</div></div></details>; };

  return <div className="eo">
    <ViewOnly role={role} what="partners, packages, booths and riders" />
    <div className="eo-stats">
      <Stat icon={Handshake} label="Partners" value={P.length} sub={`${confirmed} confirmed`} />
      <Stat icon={ClipboardCheck} label="Deliverables" value={`${dDone}/${dTotal}`} sub={dOver ? <span className="k-red">{dOver} overdue</span> : "approved or waived"} tone={dOver ? "red" : "green"} />
      <Stat icon={Store} label="Booths" value={`${B.filter(b => b.status === "allocated").length}/${B.length}`} sub={`${B.filter(b => b.status === "available").length} available`} tone="purple" />
      <Stat icon={Ticket} label="Partner passes" value={`${pIss}/${pReq}`} sub="issued / requested" tone="amber" />
      <Stat icon={Mic2} label="Riders awaiting you" value={ridersWaiting} sub={ridersWaiting ? "Accept or request changes" : "Nothing waiting"} tone={ridersWaiting ? "amber" : "green"} />
    </div>
    <div className="eo-main">
      <Card className="eo-col-main"><div className="k-between eo-head"><div><h2 className="ov-h">Partners</h2><p className="k-small">Sponsors, exhibitors, artists, speakers, performers and hosts — one record each, from prospect to completed.</p></div>
        <span className="eo-acts"><FormDialog label="New talent profile" icon="user" title="New talent profile" sub="Reusable across events; powers double-booking checks." disabledReason={dr} action={cmd.bind(null, "talent", null, {})} fields={[
          { name: "kind", label: "Kind", type: "select", required: true, options: ["artist", "band", "dj", "speaker", "performer", "host", "other"].map(k => [k, label(k)] as FieldOption) }, { name: "name", label: "Name", required: true },
          { name: "agent_name", label: "Agent name" }, { name: "agent_email", label: "Agent email", type: "email" }, { name: "website", label: "Website" }]} />
          <FormDialog label="Add partner" icon="plus" variant="primary" title="Add partner" disabledReason={dr} action={cmd.bind(null, "party", null, {})} fields={partyFields()} submitLabel="Add partner" /></span></div>
        {P.length ? groups.map(([title, kinds]) => { const list = P.filter(p => kinds.includes(p.kind)); if (!list.length) return null;
          return <div key={title} className="eo-group"><h3>{title} <span className="eo-muted">({list.length})</span></h3>{list.map(row)}</div>; })
          : <Empty icon={Handshake} title="No partners yet" text="Add a sponsor, exhibitor or talent to start tracking packages, deliverables, passes and riders." action={<FormDialog label="Add partner" icon="plus" variant="primary" title="Add partner" disabledReason={dr} action={cmd.bind(null, "party", null, {})} fields={partyFields()} submitLabel="Add partner" />} />}
      </Card>
      <div className="eo-col-side">
        <ChecksCard title="Partner checks" items={checks.items} error={checks.error} empty="No contract, deliverable, rider, booth, pass or talent-schedule issues." />
        <Card><div className="k-between"><h3 className="ov-h">Packages</h3><FormDialog label="New package" icon="plus" wide title="New package" disabledReason={dr} action={cmd.bind(null, "package", null, {})} fields={pkgFields()} /></div>
          {K.length ? <ul className="eo-list">{K.map(k => { const used = allocated(k); const sold = k.quantity != null && used >= k.quantity;
            return <li key={k.id}><span className="k-grow"><b>{k.name}{k.tier ? ` · ${k.tier}` : ""}</b><small>{label(k.kind)} · {money(k.price, k.currency)} · {used}/{k.quantity ?? "∞"} sold · {k.event_package_benefits.length} benefit(s)</small></span>
              {sold ? <Chip tone="red">Sold out</Chip> : <StatusChip s={k.status} />}<FormDialog label={`Edit ${k.name}`} icon="edit" variant="ghost" iconOnly wide title={`Edit package — ${k.name}`} sub="Edits never change deals already confirmed (they keep their snapshot)." disabledReason={dr} action={cmd.bind(null, "package", k.id, {})} fields={pkgFields(k)} /></li>; })}</ul>
            : <p className="k-small eo-muted"><Package size={14} /> No packages. Create sponsorship or exhibitor packages with a sell limit and benefits.</p>}</Card>
        <Card><div className="k-between"><h3 className="ov-h">Booths</h3><FormDialog label="Add booth" icon="plus" title="Add booth" sub="A booth is a map element by reference; set its id from the map editor." disabledReason={dr} action={cmd.bind(null, "booth", null, {})} fields={boothFields()} /></div>
          {B.length ? <ul className="eo-list">{B.map(b => <li key={b.id}><span className="k-grow"><b>{b.code}{b.name ? ` · ${b.name}` : ""}</b><small>{b.width_m && b.depth_m ? `${b.width_m}×${b.depth_m} m · ` : ""}{b.map_element_ref ? `map ${b.map_element_ref}` : "not on map"}{b.party_id ? ` · ${P.find(p => p.id === b.party_id)?.name ?? "partner"}` : ""}</small></span>
            <StatusChip s={b.status} />{b.party_id && <ActionButton label={`Release ${b.code}`} icon="undo" variant="ghost" iconOnly disabledReason={dr} confirm={{ title: `Release booth ${b.code}?`, danger: true, confirmLabel: "Release" }} action={cmd.bind(null, "release", b.id, {}, {})} />}
            <FormDialog label={`Edit booth ${b.code}`} icon="edit" variant="ghost" iconOnly title={`Edit booth ${b.code}`} disabledReason={dr} action={cmd.bind(null, "booth", b.id, {})} fields={boothFields(b)} /></li>)}</ul>
            : <p className="k-small eo-muted">No booths. {MAPS.length ? "Add booths and reference their map elements." : <>Create the event map first in <Link className="k-link" href={`/organizer/events/${ev}/map?tab=operations`}>Floor &amp; Map</Link>, or add booths without a map position.</>}</p>}
          {MAPS.length > 0 && <Link className="k-link eo-foot-link" href={`/organizer/events/${ev}/map?tab=operations`}>Open the event map</Link>}</Card>
        <Card><h3 className="ov-h">Where partners show up</h3><ul className="eo-list tight">
          <li><FileSignature size={14} /><span className="k-grow k-small">Contracts are created in the contracts engine — <Link className="k-link" href="/organizer/sales/contracts">Sales › Contracts</Link>.</span></li>
          <li><Ticket size={14} /><span className="k-grow k-small">Issued passes appear in <Link className="k-link" href={`/organizer/events/${ev}?tab=operations&section=access`}>Access &amp; passes</Link>.</span></li>
          <li><Mic2 size={14} /><span className="k-grow k-small">Slots sit on the <Link className="k-link" href={`/organizer/events/${ev}?tab=plan&section=programme`}>programme</Link>; travel and rooms in <Link className="k-link" href={`/organizer/events/${ev}?tab=operations&section=logistics`}>Logistics</Link>.</span></li></ul></Card>
      </div>
    </div>
  </div>;
}
