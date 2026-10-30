import Link from "next/link";
import { Accessibility, Armchair, Ear, ParkingSquare, Users, Lock } from "lucide-react";
import { Card, Chip } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { dateShort } from "@/lib/format";
import { complianceCommand } from "@/lib/actions/compliance";
import type { SectionProps } from "./types";
import { FormDialog, ActionButton, type Field, type FieldOption } from "./ops-forms-client";
import { canManage, VIEW_ONLY, ViewOnly, ChecksCard, Stat, opsItems } from "./ops-shared";

type Acc = { step_free: boolean | null; accessible_toilets: number; changing_places: boolean; hearing_loop: boolean; bsl_interpretation: boolean; captioning: boolean; quiet_space: boolean; assistance_dogs: boolean;
  accessible_seating: number; companion_seats: number; venue_map_id: string | null; accessible_route_refs: string[]; route_note: string; public_summary: string; summary_status: string; approved_at: string | null };
const has = (flags: string[], text: string, re: RegExp) => flags.some(f => re.test(f)) || re.test(text);

export async function AccessibilitySection({ e, d, role }: SectionProps) {
  const sb = untyped(await createClient()); const ev = e.id;
  const mgr = canManage(role); const dr = mgr ? null : VIEW_ONLY; const cmd = complianceCommand.bind(null, ev);
  const [{ data: accRow }, { data: maps }, { data: care }, { data: areas }, checks] = await Promise.all([
    sb.from("event_accessibility").select("*").eq("event_id", ev).maybeSingle(),
    sb.from("venue_maps").select("id,version,status").eq("event_id", ev).order("version", { ascending: false }),
    // Guest needs: guest_care is readable by owners/managers only (RLS); counts only are shown.
    mgr ? sb.from("guest_care").select("guest_id,access_flags,accessibility").eq("event_id", ev) : Promise.resolve({ data: null }),
    sb.from("parking_areas").select("accessible_spaces,status").eq("event_id", ev),
    opsItems(ev, i => i.domain === "compliance" && (i.fix.includes("section=accessibility") || i.key === "accessible_parking_short" || i.key === "rule_accessibility_info")),
  ]);
  const a = accRow as Acc | null; const M = (maps ?? []) as { id: string; version: number; status: string }[];
  const declined = new Set(d.guests.filter(g => g.status === "declined").map(g => g.id));
  const C = ((care ?? []) as { guest_id: string; access_flags: string[]; accessibility: string }[]).filter(c => !declined.has(c.guest_id));
  const need = care ? {
    wheel: C.filter(c => has(c.access_flags, c.accessibility, /wheelchair|step.?free/i)).length,
    hear: C.filter(c => has(c.access_flags, "", /hearing|loop|deaf/i)).length,
    park: C.filter(c => has(c.access_flags, "", /parking|blue.?badge/i)).length,
    comp: C.filter(c => has(c.access_flags, "", /companion|carer/i)).length,
  } : null;
  const accParking = ((areas ?? []) as { accessible_spaces: number; status: string }[]).filter(x => x.status === "active").reduce((s, x) => s + x.accessible_spaces, 0);
  const fields: Field[] = [
    { name: "step_free", label: "Step-free access throughout", type: "tri", defaultValue: a?.step_free ?? null },
    { name: "accessible_toilets", label: "Accessible toilets", type: "number", min: 0, required: true, defaultValue: a?.accessible_toilets ?? 0 },
    { name: "accessible_seating", label: "Wheelchair / accessible spaces", type: "number", min: 0, required: true, defaultValue: a?.accessible_seating ?? 0 },
    { name: "companion_seats", label: "Companion seats", type: "number", min: 0, required: true, defaultValue: a?.companion_seats ?? 0 },
    ...([["changing_places", "Changing Places toilet"], ["hearing_loop", "Hearing loop"], ["bsl_interpretation", "BSL interpretation"], ["captioning", "Live captioning"], ["quiet_space", "Quiet space"], ["assistance_dogs", "Assistance dogs welcome"]] as const)
      .map(([k, l]) => ({ name: k, label: l, type: "checkbox", defaultValue: a ? a[k] : k === "assistance_dogs", hint: "Provided" } as Field)),
    { name: "venue_map_id", label: "Event map (for the route)", type: "select", options: M.map(m => [m.id, `Map v${m.version} (${m.status})`] as FieldOption), defaultValue: a?.venue_map_id ?? M[0]?.id },
    { name: "route_refs", label: "Accessible route — map element ids", defaultValue: (a?.accessible_route_refs ?? []).join(", "), hint: "Comma separated, from the map editor. Each must exist on the chosen map." },
    { name: "route_note", label: "Route description", type: "textarea", defaultValue: a?.route_note },
    { name: "public_summary", label: "Public accessibility summary", type: "textarea", maxLength: 2000, defaultValue: a?.public_summary, hint: "Shown to attendees only after a manager approves it. Editing it returns it to draft." },
  ];
  const yes = (b: boolean | null | undefined) => b ? <Chip tone="green">Yes</Chip> : b === false ? <Chip tone="gray">No</Chip> : <Chip tone="amber">Not confirmed</Chip>;

  return <div className="eo">
    <ViewOnly role={role} what="accessibility provisions" />
    <div className="eo-stats">
      <Stat icon={Accessibility} label="Step-free access" value={a?.step_free ? "Confirmed" : a?.step_free === false ? "No" : "Not confirmed"} tone={a?.step_free ? "green" : "amber"} />
      <Stat icon={Armchair} label="Accessible spaces" value={a?.accessible_seating ?? 0} sub={need ? `${need.wheel} guest(s) need one` : "Guest needs: managers only"} tone={need && need.wheel > (a?.accessible_seating ?? 0) ? "red" : "blue"} />
      <Stat icon={Users} label="Companion seats" value={a?.companion_seats ?? 0} sub={need ? `${need.comp} requested` : undefined} tone={need && need.comp > (a?.companion_seats ?? 0) ? "amber" : "blue"} />
      <Stat icon={Ear} label="Hearing support" value={a?.hearing_loop || a?.captioning ? "Provided" : "None"} sub={need ? `${need.hear} requested` : undefined} tone={need && need.hear && !(a?.hearing_loop || a?.captioning) ? "amber" : "purple"} />
      <Stat icon={ParkingSquare} label="Accessible parking" value={accParking} sub={need ? `${need.park} requested` : "spaces set aside"} tone={need && need.park > accParking ? "amber" : "green"} />
    </div>
    <div className="eo-main">
      <div className="eo-col-main">
        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Provisions</h2><p className="k-small">What the venue and your team provide. Used for readiness checks against guest needs and for the public summary.</p></div>
          <FormDialog label={a ? "Edit provisions" : "Add provisions"} icon="edit" variant="primary" wide title="Accessibility provisions" disabledReason={dr} action={cmd.bind(null, "access", null, {})} fields={fields} /></div>
          {a ? <div className="eo-provisions">
            <div className="eo-kv"><span>Step-free access</span>{yes(a.step_free)}</div><div className="eo-kv"><span>Accessible toilets</span><b>{a.accessible_toilets}</b></div>
            <div className="eo-kv"><span>Changing Places</span>{yes(a.changing_places)}</div><div className="eo-kv"><span>Hearing loop</span>{yes(a.hearing_loop)}</div>
            <div className="eo-kv"><span>BSL interpretation</span>{yes(a.bsl_interpretation)}</div><div className="eo-kv"><span>Live captioning</span>{yes(a.captioning)}</div>
            <div className="eo-kv"><span>Quiet space</span>{yes(a.quiet_space)}</div><div className="eo-kv"><span>Assistance dogs</span>{yes(a.assistance_dogs)}</div>
            <div className="eo-kv"><span>Accessible route</span><span>{a.accessible_route_refs.length ? `${a.accessible_route_refs.length} map element(s): ${a.accessible_route_refs.join(", ")}` : "Not mapped"}</span></div>
            {a.route_note && <p className="k-small eo-full">{a.route_note}</p>}
            {M.length > 0 && <Link className="k-link" href={`/organizer/events/${ev}/map?tab=operations`}>Open the event map</Link>}</div>
            : <p className="k-small eo-muted">Nothing recorded yet. Add what the venue provides — step-free access, toilets, seating, hearing support — so guest needs can be checked.</p>}</Card>
        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Public summary</h2><p className="k-small">Attendees see this only once it&apos;s approved. Describe facilities factually; don&apos;t promise what isn&apos;t confirmed.</p></div>
          <span className="eo-acts">{a && <Chip tone={a.summary_status === "approved" ? "green" : "amber"}>{a.summary_status === "approved" ? `Approved ${a.approved_at ? dateShort(a.approved_at) : ""}` : "Draft — not public"}</Chip>}
            {a?.summary_status !== "approved" && <ActionButton label="Approve summary" icon="check" variant="primary" disabledReason={dr ?? (!a?.public_summary?.trim() ? "Write the public summary first (Edit provisions)." : null)} confirm={{ title: "Approve the public accessibility summary?", message: "It becomes visible on the event's public information." }} action={cmd.bind(null, "access_approve", null, {}, {})} />}</span></div>
          {a?.public_summary ? <p className="eo-summary">{a.public_summary}</p> : <p className="k-small eo-muted">No summary written yet.</p>}</Card>
      </div>
      <div className="eo-col-side">
        <ChecksCard title="Accessibility checks" items={checks.items} error={checks.error} empty="No guest needs are short of provision." />
        <Card><h3 className="ov-h">Guest needs</h3>
          {need ? <><ul className="eo-facts"><li><span>Wheelchair / step-free</span><b>{need.wheel}</b></li><li><span>Hearing support</span><b>{need.hear}</b></li><li><span>Accessible parking</span><b>{need.park}</b></li><li><span>Companion / carer</span><b>{need.comp}</b></li></ul>
            <p className="k-small eo-muted">Counts from guests&apos; access requirements (declined guests excluded). Individual details stay in the guest list.</p>
            <Link className="k-link" href={`/organizer/events/${ev}?tab=plan&section=guests`}>Open guests</Link></>
            : <p className="k-small eo-muted"><Lock size={13} /> Guest access needs are visible to owners and managers only. Blockers above still show when provision is short.</p>}</Card>
        <Card><h3 className="ov-h">Related</h3><ul className="eo-list tight">
          <li><span className="k-grow k-small">Accessible parking spaces — <Link className="k-link" href={`/organizer/events/${ev}?tab=operations&section=logistics`}>Operations › Logistics</Link></span></li>
          <li><span className="k-grow k-small">Licensing and safety — <Link className="k-link" href={`/organizer/events/${ev}?tab=plan&section=compliance`}>Plan › Compliance</Link></span></li></ul></Card>
      </div>
    </div>
  </div>;
}
