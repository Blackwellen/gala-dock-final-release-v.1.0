import Link from "next/link";
import { ShieldCheck, FileCheck2, ClipboardList, AlertTriangle, Scale, CircleHelp } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { dateShort, num } from "@/lib/format";
import { complianceCommand } from "@/lib/actions/compliance";
import type { SectionProps } from "./types";
import { FormDialog, ActionButton, type Field, type FieldOption } from "./ops-forms-client";
import { canManage, VIEW_ONLY, ViewOnly, ChecksCard, Stat, StatusChip, label, opsItems } from "./ops-shared";

type Facts = { country: string; region: string | null; event_type: string; attendance: number; in_person: boolean; public: boolean; alcohol: boolean; hot_food: boolean; live_music: boolean; recorded_music: boolean; late_night: boolean; children_performing: boolean; outdoor: boolean; answered: boolean };
type Req = { rule_key: string; label: string; requirement_kind: string; severity: string; status: string; reason: string | null; fix: string; link: string; due_date: string | null; pack_key: string };
type Lic = { id: string; type: string; label: string; status: string; holder: string; reference: string; authority: string; valid_from: string | null; valid_to: string | null; has_document: boolean };
type Plan = { id: string; kind: string; version: number; status: string; title: string; sections: { heading: string; body: string }[]; stewards: number | null; first_aiders: number | null; medical_provider: string; review_due: string | null; author_id: string | null; decision_note: string; approved_at: string | null; submitted_at: string | null };
type Overview = { facts: Facts; requirements: Req[]; licences: Lic[] };

export const PLAN_KINDS: FieldOption[] = [["event_safety", "Event safety"], ["crowd", "Crowd management"], ["fire", "Fire"], ["evacuation", "Evacuation"], ["first_aid", "First aid"], ["medical", "Medical"], ["security", "Security"], ["safeguarding", "Safeguarding"], ["weather", "Weather"]];
const L_NEXT: Record<string, string[]> = { draft: ["submitted", "granted", "not_required", "withdrawn"], submitted: ["granted", "refused", "not_required", "withdrawn"], refused: ["submitted", "withdrawn"], granted: ["expired", "revoked"], expired: ["submitted"], not_required: ["draft"] };
const FACTS: [keyof Facts, string][] = [["alcohol", "Alcohol sold or supplied"], ["live_music", "Live music"], ["recorded_music", "Recorded music / DJ"], ["late_night", "Finishes after 23:00"], ["hot_food", "Hot food or drink"], ["children_performing", "Children performing"], ["outdoor", "Outdoor areas"]];
const REQ_TONE: Record<string, "green" | "purple" | "blue" | "red" | "amber"> = { met: "green", waived: "purple", pending: "blue", missing: "red", expired: "red", refused: "red" };

export async function ComplianceSection({ e, role }: SectionProps) {
  const sb = untyped(await createClient()); const ev = e.id;
  const mgr = canManage(role); const dr = mgr ? null : VIEW_ONLY; const cmd = complianceCommand.bind(null, ev);
  const [{ data: ov, error }, { data: prof }, { data: types }, { data: plansRaw }, { data: packs }, checks, { data: me }, { data: wsRow }] = await Promise.all([
    sb.rpc("event_compliance_overview", { p_event: ev }),
    sb.from("event_compliance_profiles").select("*").eq("event_id", ev).maybeSingle(),
    sb.from("licence_types").select("key,label,category,expires,description").order("label"),
    sb.from("safety_plans").select("*").eq("event_id", ev).order("kind").order("version", { ascending: false }),
    sb.from("compliance_rule_packs").select("key,name,country,version,source_note").eq("active", true),
    opsItems(ev, i => i.domain === "compliance" && !i.fix.includes("section=accessibility") && !i.fix.includes("section=weather") && !i.fix.includes("section=logistics")),
    sb.auth.getUser(),
    sb.from("workspaces").select("owner_id").eq("id", e.workspace_id as string).maybeSingle(),
  ]);
  if (error || !ov) return <Card><Empty icon={ShieldCheck} title="Compliance couldn't load" text="Refresh the page to try again." /></Card>;
  const O = ov as Overview; const F = O.facts; const P = (plansRaw ?? []) as Plan[]; const LT = (types ?? []) as { key: string; label: string; category: string; expires: boolean; description: string }[];
  const pr = prof as Record<string, unknown> | null; const uid = me?.user?.id; const isOwner = !!uid && (wsRow as { owner_id?: string } | null)?.owner_id === uid;
  const pack = ((packs ?? []) as { key: string; name: string; country: string; version: number }[]).find(p => O.requirements.some(r => r.pack_key === p.key));
  const req = O.requirements; const required = req.filter(r => r.severity === "required");
  const failing = required.filter(r => ["missing", "expired", "refused"].includes(r.status));
  const kindLabel = (k: string) => PLAN_KINDS.find(x => x[0] === k)?.[1] ?? label(k);

  const profileFields: Field[] = [
    { name: "country", label: "Country (ISO code)", defaultValue: (pr?.country as string) ?? F.country, maxLength: 2, hint: "Picks the rule pack. GB uses England & Wales." },
    { name: "region", label: "Region (optional)", defaultValue: (pr?.region as string) ?? "" },
    { name: "expected_attendance", label: "Expected attendance at peak", type: "number", min: 0, defaultValue: (pr?.expected_attendance as number | null) ?? "", hint: `Blank = derived (${num(F.attendance)} from capacity / guests).` },
    ...FACTS.map(([k, l]) => ({ name: k, label: l, type: "tri", defaultValue: (pr?.[k] as boolean | null | undefined) ?? null, hint: undefined } as Field)),
    { name: "notes", label: "Notes", type: "textarea", defaultValue: (pr?.notes as string) ?? "" },
  ];
  const licenceFields = (l?: Lic): Field[] => [
    ...(l ? [] : [{ name: "licence_type", label: "Licence type", type: "select", required: true, options: LT.map(t => [t.key, t.label] as FieldOption) } as Field]),
    { name: "holder", label: "Held by", type: "select", required: true, defaultValue: l?.holder ?? "organizer", options: [["organizer", "Us (organiser)"], ["venue", "The venue"], ["supplier", "A supplier"], ["other", "Other"]] },
    { name: "authority", label: "Issuing authority", defaultValue: l?.authority, placeholder: "e.g. Camden Council" }, { name: "reference", label: "Reference", defaultValue: l?.reference },
    { name: "valid_from", label: "Valid from", type: "datetime", defaultValue: l?.valid_from }, { name: "valid_to", label: "Valid to", type: "datetime", defaultValue: l?.valid_to },
    { name: "conditions", label: "Conditions", type: "textarea" }];
  const planFields = (p?: Plan): Field[] => [{ name: "title", label: "Title", defaultValue: p?.title }, { name: "stewards", label: "Stewards", type: "number", min: 0, defaultValue: p?.stewards ?? "" },
    { name: "first_aiders", label: "First aiders", type: "number", min: 0, defaultValue: p?.first_aiders ?? "" }, { name: "medical_provider", label: "Medical provider", defaultValue: p?.medical_provider },
    { name: "review_due", label: "Review due", type: "date", defaultValue: p?.review_due },
    { name: "sections", label: "Sections", type: "rows", maxRows: 40, defaultValue: p?.sections?.length ? p.sections : [{ heading: "Site and hazards", body: "" }], columns: [{ name: "heading", label: "Heading", required: true }, { name: "body", label: "Content", type: "textarea", maxLength: 8000 }], hint: "Submitted versions are immutable — later edits create a new version." }];
  const byKind = PLAN_KINDS.map(([k]) => [k, P.filter(p => p.kind === k)] as const).filter(([, v]) => v.length);

  return <div className="eo">
    <ViewOnly role={role} what="licensing and safety records" />
    <div className="k-notice amber eo-legal" role="note"><Scale size={16} /><span><b>Guidance, not legal advice.</b> Requirements come from {pack ? `the “${pack.name}” rule pack (v${pack.version})` : "a jurisdiction rule pack"}, which is awaiting legal review. Meeting every check here is not a statement that the event is legally compliant — confirm with the licensing authority.</span></div>
    <div className="eo-stats">
      <Stat icon={ShieldCheck} label="Required checks met" value={`${required.filter(r => ["met", "waived"].includes(r.status)).length}/${required.length}`} sub={failing.length ? <span className="k-red">{failing.length} missing / expired / refused</span> : "None failing"} tone={failing.length ? "red" : "green"} />
      <Stat icon={ClipboardList} label="Pending decisions" value={req.filter(r => r.status === "pending").length} sub="submitted, awaiting authority / approval" tone="blue" />
      <Stat icon={FileCheck2} label="Licences granted" value={`${O.licences.filter(l => l.status === "granted").length}/${O.licences.length}`} sub="recorded" tone="purple" />
      <Stat icon={AlertTriangle} label="Safety plans approved" value={new Set(P.filter(p => p.status === "approved").map(p => p.kind)).size} sub={`${P.filter(p => p.status === "submitted").length} waiting for approval`} tone="amber" />
    </div>
    <div className="eo-main">
      <div className="eo-col-main">
        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Requirements</h2><p className="k-small">One row per rule that applies to this event&apos;s facts. Required failures block readiness; recommended ones warn.</p></div></div>
          {req.length ? <div className="eo-scroll"><table className="k-table eo-table"><thead><tr><th>Requirement</th><th>Severity</th><th>Status</th><th>Why / what to do</th><th>Deadline</th></tr></thead><tbody>{req.map(r => <tr key={r.rule_key}>
            <td><b>{r.label}</b><small className="eo-block">{label(r.requirement_kind)}</small></td><td><Chip tone={r.severity === "required" ? "red" : "gray"}>{label(r.severity)}</Chip></td><td><Chip tone={REQ_TONE[r.status] ?? "gray"}>{label(r.status)}</Chip></td>
            <td className="eo-wrap">{r.reason && <span className="eo-block">{r.reason}</span>}{!["met", "waived"].includes(r.status) && <small className="eo-block">Fix: {r.fix}</small>}{r.link && !r.link.endsWith("section=compliance") && <Link className="k-link" href={r.link}>Open</Link>}</td>
            <td className={r.due_date && r.due_date < new Date().toISOString().slice(0, 10) && !["met", "waived"].includes(r.status) ? "k-red" : ""}>{r.due_date ? dateShort(r.due_date) : "—"}</td></tr>)}</tbody></table></div>
            : <Empty icon={ShieldCheck} title="No rules apply yet" text={F.in_person ? `No rule in the ${F.country} pack matches these facts. Answer the licensing questions so the right checks run.` : "Online-only events have no in-person licensing rules in this pack."} />}</Card>

        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Licences &amp; notices</h2><p className="k-small">Draft → submitted → granted or refused; granted licences expire or can be revoked. Expiry reminders run daily.</p></div>
          <FormDialog label="Add licence" icon="plus" variant="primary" title="Record a licence or notice" disabledReason={dr} action={cmd.bind(null, "licence", null, {})} fields={licenceFields()} /></div>
          {O.licences.length ? <ul className="eo-list">{O.licences.map(l => { const t = LT.find(x => x.key === l.type);
            return <li key={l.id}><span className="k-grow"><b>{l.label}</b><small>{label(l.holder)}{l.authority ? ` · ${l.authority}` : ""}{l.reference ? ` · ref ${l.reference}` : ""}{l.valid_to ? ` · valid to ${dateShort(l.valid_to)}` : ""}</small></span><StatusChip s={l.status} />
              <span className="eo-acts">{(L_NEXT[l.status] ?? []).map(to => to === "granted"
                ? <FormDialog key={to} label="Granted" icon="check" variant="soft" title={`Mark granted — ${l.label}`} sub={t?.expires ? "This licence type expires: a valid-to date is required." : "A reference is required."} submitLabel="Mark granted" disabledReason={dr} action={cmd.bind(null, "licence_to", l.id, { to })} fields={[{ name: "reference", label: "Reference", required: true, defaultValue: l.reference }, { name: "valid_from", label: "Valid from", type: "datetime", defaultValue: l.valid_from }, { name: "valid_to", label: "Valid to", type: "datetime", required: !!t?.expires, defaultValue: l.valid_to }]} />
                : ["not_required", "refused", "revoked", "withdrawn"].includes(to)
                  ? <FormDialog key={to} label={to === "not_required" ? "Not required" : label(to)} icon="ban" variant="ghost" title={`${label(to)} — ${l.label}`} submitLabel={label(to)} disabledReason={dr} action={cmd.bind(null, "licence_to", l.id, { to })} fields={[{ name: "note", label: to === "not_required" ? "Why it isn't needed (min 10 characters)" : "Note", type: "textarea", required: to === "not_required" }]} />
                  : <ActionButton key={to} label={to === "submitted" ? "Mark submitted" : to === "draft" ? "Reopen" : label(to)} icon={to === "submitted" ? "send" : "undo"} variant="ghost" disabledReason={dr} action={cmd.bind(null, "licence_to", l.id, { to }, {})} />)}
                <FormDialog label={`Edit ${l.label}`} icon="edit" variant="ghost" iconOnly title={`Edit — ${l.label}`} disabledReason={dr} action={cmd.bind(null, "licence", l.id, {})} fields={licenceFields(l)} />
                {l.valid_to && <FormDialog label={`Clear expiry of ${l.label}`} icon="x" variant="ghost" iconOnly title={`Clear the valid-to date — ${l.label}`} sub="The licence will show no expiry date and expiry reminders stop. Add the date again from Edit when you have it." submitLabel="Clear expiry"
                  disabledReason={dr ?? (l.status === "granted" && t?.expires ? "This licence type expires, so a granted licence must keep its valid-to date — edit it to the renewed date instead." : null)}
                  action={cmd.bind(null, "licence_clear", l.id, {})} fields={[{ name: "note", label: "Why (optional, kept in the audit log)", type: "textarea", maxLength: 500 }]} />}</span></li>; })}</ul>
            : <p className="k-small eo-muted">No licences recorded. Record premises licences, TENs, music licences and insurance against the requirements above.</p>}</Card>

        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Safety plans</h2><p className="k-small">Versioned. Submitted versions can&apos;t change; a manager other than the author approves (the workspace owner may approve their own).</p></div>
          <FormDialog label="New plan" icon="plus" variant="primary" wide title="New safety plan draft" disabledReason={dr} action={cmd.bind(null, "plan", null, {})} fields={[{ name: "kind", label: "Plan", type: "select", required: true, options: PLAN_KINDS }, ...planFields()]} /></div>
          {byKind.length ? byKind.map(([k, versions]) => <div key={k} className="eo-sub"><h4>{kindLabel(k)}</h4><ul className="eo-list tight">{versions.slice(0, 4).map(p => { const self = p.author_id === uid && !isOwner;
            return <li key={p.id}><span className="k-grow"><b>v{p.version}{p.title ? ` · ${p.title}` : ""}</b><small>{p.sections.length} section(s){p.stewards != null ? ` · ${p.stewards} stewards` : ""}{p.first_aiders != null ? ` · ${p.first_aiders} first aiders` : ""}{p.review_due ? ` · review ${dateShort(p.review_due)}` : ""}{p.decision_note ? ` · “${p.decision_note}”` : ""}</small></span><StatusChip s={p.status} />
              <span className="eo-acts">{p.status === "draft" && <><FormDialog label="Edit draft" icon="edit" variant="ghost" wide title={`${kindLabel(k)} plan v${p.version}`} disabledReason={dr} action={cmd.bind(null, "plan", null, { kind: k })} fields={planFields(p)} />
                <ActionButton label="Submit" icon="send" variant="soft" disabledReason={dr} confirm={{ title: `Submit ${kindLabel(k).toLowerCase()} plan v${p.version}?`, message: "It can't be edited after submission." }} action={cmd.bind(null, "plan_submit", p.id, {}, {})} /></>}
                {p.status === "submitted" && <><ActionButton label="Approve" icon="check" variant="soft" disabledReason={dr ?? (self ? "You wrote this version — another manager (or the owner) must approve it." : null)} confirm={{ title: `Approve v${p.version}?`, message: "Supersedes the previously approved version." }} action={cmd.bind(null, "plan_decide", p.id, { decision: "approved" }, {})} />
                  <FormDialog label="Request changes" icon="undo" variant="ghost" title="Request changes" submitLabel="Send back" disabledReason={dr ?? (self ? "You wrote this version — another manager must review it." : null)} action={cmd.bind(null, "plan_decide", p.id, { decision: "changes_requested" })} fields={[{ name: "note", label: "What needs to change (required)", type: "textarea", required: true }]} /></>}
                {["approved", "changes_requested"].includes(p.status) && p === versions[0] && <FormDialog label="New version" icon="plus" variant="ghost" wide title={`New ${kindLabel(k).toLowerCase()} plan version`} sub={`Starts from v${p.version}.`} disabledReason={dr} action={cmd.bind(null, "plan", null, { kind: k })} fields={planFields(p)} />}</span></li>; })}</ul></div>)
            : <p className="k-small eo-muted">No safety plans yet. Large or outdoor events need an approved event safety plan.</p>}</Card>
      </div>
      <div className="eo-col-side">
        <ChecksCard title="Compliance checks" items={checks.items} error={checks.error} empty="No failing required rules, expiring licences or plans waiting." />
        <Card><div className="k-between"><h3 className="ov-h">Licensing questions</h3><FormDialog label={F.answered ? "Edit answers" : "Answer"} icon="edit" variant={F.answered ? "outline" : "primary"} title="Licensing questions" sub="Leave a question as “Not answered” to use the value derived from bookings, talent, times and spaces." disabledReason={dr} action={cmd.bind(null, "profile", null, {})} fields={profileFields} /></div>
          {!F.answered && <p className="k-small eo-muted"><CircleHelp size={13} /> Not answered yet — showing derived values.</p>}
          <ul className="eo-facts">
            <li><span>Jurisdiction</span><b>{F.country}{F.region ? ` · ${F.region}` : ""}</b></li><li><span>Attendance</span><b>{num(F.attendance)}{pr?.expected_attendance == null ? " (derived)" : ""}</b></li>
            <li><span>Format</span><b>{F.in_person ? "In person" : "Online"} · {F.public ? "Public" : "Private"}</b></li>
            {FACTS.map(([k, l]) => <li key={k}><span>{l}</span><b>{F[k] ? "Yes" : "No"}{pr?.[k] == null ? <em> (derived)</em> : ""}</b></li>)}</ul></Card>
        <Card><h3 className="ov-h">Related</h3><ul className="eo-list tight">
          <li><span className="k-grow k-small">Accessibility information and guest needs — <Link className="k-link" href={`/organizer/events/${ev}?tab=plan&section=accessibility`}>Plan › Accessibility</Link></span></li>
          <li><span className="k-grow k-small">Weather watch and contingency — <Link className="k-link" href={`/organizer/events/${ev}?tab=operations&section=weather`}>Operations › Weather</Link></span></li>
          <li><span className="k-grow k-small">Event files (licence copies, plans) — <Link className="k-link" href={`/organizer/events/${ev}?tab=plan&section=files`}>Plan › Files</Link></span></li></ul></Card>
      </div>
    </div>
  </div>;
}
