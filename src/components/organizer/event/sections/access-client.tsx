"use client";
import { useState } from "react";
import { Plus, PenLine, ShieldCheck, Printer, Trash2, UserPlus } from "lucide-react";
import QRCode from "qrcode";
import { Dialog, useAction, useKitToast } from "@/components/kit/client";
import { saveAccessZone, saveZoneAccessRules, saveBadgeTemplate, assignScannerByEmail } from "@/lib/events/access-actions";
import { issuePass, revokePass, printBadge, revokeScanner } from "@/lib/guests/access";
import { ActionButton, toIso, toLocal, intOrNull } from "./s2-shared";
import { safeSvgColor } from "@/lib/security/svg-sanitize";

export type ZoneRow = { id: string; name: string; kind: string; capacity: number | null; opens_at: string | null; closes_at: string | null; reentry: string; max_entries: number | null; status: string; sort: number };
export type RuleRow = { id: string; zone_id: string; tier_id: string | null; pass_type: string | null; valid_from: string | null; valid_to: string | null };
export type PassRow = { id: string; pass_type: string; code: string; holder_name: string; holder_email: string; zones: string[]; valid_from: string | null; valid_to: string | null; status: string;
  printed_count: number; last_printed_at: string | null; revoked_reason: string; checked_in_at: string | null; badge_template_id: string | null; created_at: string };
export type BadgeRow = { id: string; family_id: string; version: number; status: string; name: string; layout: { show?: string[]; size?: string; accent?: string } | null; pass_types: string[]; created_at: string };
export type ScannerRow = { id: string; user_id: string; name: string | null; email: string | null; zones: string[]; expires_at: string | null; revoked_at: string | null; created_at: string; member: boolean };
type Opt = { id: string; name: string };

const PASS_TYPES = ["guest", "staff", "supplier", "artist", "vip", "backstage", "press"] as const;
const ZONE_KINDS = [["general", "General"], ["vip", "VIP"], ["backstage", "Backstage"], ["staff", "Staff"], ["artist", "Artist"], ["supplier", "Supplier"], ["press", "Press"], ["accessible", "Accessible"], ["other", "Other"]] as const;
const BADGE_FIELDS = [["holder_name", "Holder name"], ["pass_type", "Pass type"], ["zones", "Zones"], ["event_name", "Event name"], ["event_date", "Event date"], ["code", "Pass code"], ["qr", "QR code"], ["organisation", "Organisation line"]] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Checks({ options, value, onChange, label }: { options: readonly (readonly [string, string])[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return <fieldset className="ax-checks"><legend className="k-label">{label}</legend>
    {options.map(([k, l]) => <label key={k} className="k-check"><input type="checkbox" checked={value.includes(k)} onChange={e => onChange(e.target.checked ? [...value, k] : value.filter(x => x !== k))} />{l}</label>)}
  </fieldset>;
}

// ── Zones ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function ZoneButton({ eventId, zone, primary }: { eventId: string; zone?: ZoneRow; primary?: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", kind: "general", capacity: "", opens: "", closes: "", reentry: "allow", max: "", status: "active" });
  const start = () => { setF({ name: zone?.name ?? "", kind: zone?.kind ?? "general", capacity: zone?.capacity ? String(zone.capacity) : "", opens: toLocal(zone?.opens_at), closes: toLocal(zone?.closes_at), reentry: zone?.reentry ?? "allow", max: zone?.max_entries ? String(zone.max_entries) : "", status: zone?.status ?? "active" }); setOpen(true); };
  const save = async () => {
    const r = await run(() => saveAccessZone(eventId, { name: f.name, kind: f.kind, capacity: intOrNull(f.capacity), opens_at: toIso(f.opens), closes_at: toIso(f.closes), reentry: f.reentry, max_entries: f.reentry === "limited" ? intOrNull(f.max) : null, status: f.status }, zone?.id));
    if (r.ok) setOpen(false);
  };
  return <>
    {zone ? <button type="button" className="k-icon-btn" aria-label={`Edit zone ${zone.name}`} title="Edit zone" onClick={start}><PenLine size={14} /></button>
      : <button type="button" className={`k-btn ${primary ? "primary" : "outline"} sm`} onClick={start}><Plus size={14} />Add zone</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title={zone ? `Edit ${zone.name}` : "Add access zone"} sub="Capacity and window are enforced at the door scanner."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !f.name.trim()} onClick={() => void save()}>Save zone</button></>}>
      <div className="k-col" style={{ gap: 12 }}>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Zone name <b>*</b></span><input className="k-input" value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} placeholder="VIP deck" /></label>
          <label className="k-field"><span>Kind</span><select className="k-select" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{ZONE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="k-field"><span>Capacity</span><input className="k-input" inputMode="numeric" value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value.replace(/\D/g, "") })} placeholder="No limit" /></label>
          <label className="k-field"><span>Status</span><select className="k-select" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Open for scanning</option><option value="closed">Closed</option></select></label>
          <label className="k-field"><span>Opens</span><input className="k-input" type="datetime-local" value={f.opens} onChange={e => setF({ ...f, opens: e.target.value })} /></label>
          <label className="k-field"><span>Closes</span><input className="k-input" type="datetime-local" value={f.closes} onChange={e => setF({ ...f, closes: e.target.value })} /></label>
          <label className="k-field"><span>Re-entry</span><select className="k-select" value={f.reentry} onChange={e => setF({ ...f, reentry: e.target.value })}><option value="allow">Allowed</option><option value="deny">No re-entry</option><option value="limited">Limited</option></select></label>
          {f.reentry === "limited" && <label className="k-field"><span>Maximum entries <b>*</b></span><input className="k-input" inputMode="numeric" value={f.max} onChange={e => setF({ ...f, max: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="2" /></label>}
        </div>
        <p className="k-xs k-muted" style={{ margin: 0 }}>Leave the window empty to keep the zone open for the whole event.</p>
      </div>
    </Dialog>
  </>;
}

type RuleDraft = { kind: "tier" | "pass"; ref: string; from: string; to: string };
export function RulesButton({ eventId, zone, rules, tiers }: { eventId: string; zone: ZoneRow; rules: RuleRow[]; tiers: Opt[] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false); const [list, setList] = useState<RuleDraft[]>([]);
  const start = () => { setList(rules.map(r => ({ kind: r.tier_id ? "tier" : "pass", ref: r.tier_id ?? r.pass_type ?? "", from: toLocal(r.valid_from), to: toLocal(r.valid_to) }))); setOpen(true); };
  const set = (i: number, p: Partial<RuleDraft>) => setList(l => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    const r = await run(() => saveZoneAccessRules(eventId, zone.id, list.filter(x => x.ref).map(x => ({ ...(x.kind === "tier" ? { tier_id: x.ref } : { pass_type: x.ref }), valid_from: toIso(x.from), valid_to: toIso(x.to) }))));
    if (r.ok) setOpen(false);
  };
  return <>
    <button type="button" className="k-icon-btn" aria-label={`Who can enter ${zone.name}`} title="Who gets in" onClick={start}><ShieldCheck size={14} /></button>
    <Dialog wide open={open} onClose={() => setOpen(false)} title={`Who can enter ${zone.name}`} sub="Each rule admits one ticket tier or one pass type, optionally only during a time window."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending} onClick={() => void save()}>Save access</button></>}>
      <div className="k-col" style={{ gap: 8 }}>
        {list.map((x, i) => <div key={i} className="ax-rule">
          <select className="k-select" aria-label="Rule type" value={x.kind} onChange={e => set(i, { kind: e.target.value as RuleDraft["kind"], ref: "" })}><option value="tier">Ticket tier</option><option value="pass">Pass type</option></select>
          <select className="k-select" aria-label={x.kind === "tier" ? "Ticket tier" : "Pass type"} value={x.ref} onChange={e => set(i, { ref: e.target.value })}><option value="">Choose…</option>
            {x.kind === "tier" ? tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>) : PASS_TYPES.map(p => <option key={p} value={p}>{cap(p)} pass</option>)}</select>
          <input className="k-input" type="datetime-local" aria-label="Valid from" value={x.from} onChange={e => set(i, { from: e.target.value })} />
          <input className="k-input" type="datetime-local" aria-label="Valid until" value={x.to} onChange={e => set(i, { to: e.target.value })} />
          <button type="button" className="k-icon-btn" aria-label="Remove rule" onClick={() => setList(l => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>)}
        {!list.length && <p className="k-small k-muted" style={{ margin: 0 }}>No rules — only passes that list this zone can enter.</p>}
        <div><button type="button" className="k-btn outline sm" onClick={() => setList(l => [...l, { kind: "tier", ref: "", from: "", to: "" }])}><Plus size={14} />Add rule</button></div>
        {!tiers.length && <p className="k-xs k-muted" style={{ margin: 0 }}>This event has no ticket tiers yet — add them in Sell › Tickets to admit ticket holders.</p>}
      </div>
    </Dialog>
  </>;
}

// ── Passes ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function IssuePassButton({ eventId, zones, badges }: { eventId: string; zones: Opt[]; badges: BadgeRow[]; primary?: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const blank = { type: "staff", name: "", email: "", zones: [] as string[], from: "", to: "", badge: "" };
  const [f, setF] = useState(blank);
  const save = async () => {
    const r = await run(() => issuePass(eventId, { pass_type: f.type, holder_name: f.name, holder_email: f.email.trim(), zones: f.zones, valid_from: toIso(f.from), valid_to: toIso(f.to), badge_template_id: f.badge || null }));
    if (r.ok) { setOpen(false); setF(blank); }
  };
  return <>
    <button type="button" className="k-btn primary sm" onClick={() => setOpen(true)}><Plus size={14} />Issue pass</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Issue a pass" sub="The pass code scans at the door; print the badge from the pass list."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !f.name.trim() || (!!f.email && !/^\S+@\S+\.\S+$/.test(f.email))} onClick={() => void save()}>Issue pass</button></>}>
      <div className="k-col" style={{ gap: 12 }}>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Pass type</span><select className="k-select" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{PASS_TYPES.map(p => <option key={p} value={p}>{cap(p)}</option>)}</select></label>
          <label className="k-field"><span>Holder name <b>*</b></span><input className="k-input" value={f.name} maxLength={120} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label className="k-field"><span>Holder email</span><input className="k-input" type="email" value={f.email} maxLength={200} onChange={e => setF({ ...f, email: e.target.value })} /><small>Kept for your records — never printed on the badge.</small></label>
          <label className="k-field"><span>Badge template</span><select className="k-select" value={f.badge} onChange={e => setF({ ...f, badge: e.target.value })}><option value="">Default for the pass type</option>{badges.map(b => <option key={b.id} value={b.id}>{b.name} v{b.version}</option>)}</select></label>
          <label className="k-field"><span>Valid from</span><input className="k-input" type="datetime-local" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
          <label className="k-field"><span>Valid until</span><input className="k-input" type="datetime-local" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label>
        </div>
        {zones.length ? <Checks label="Zones this pass opens (in addition to pass-type rules)" options={zones.map(z => [z.id, z.name] as const)} value={f.zones} onChange={v => setF({ ...f, zones: v })} />
          : <p className="k-xs k-muted" style={{ margin: 0 }}>No zones yet — the pass admits to the event; add zones above to restrict areas.</p>}
      </div>
    </Dialog>
  </>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function PassActions({ pass, eventName, eventDate, zoneNames, template }: { pass: PassRow; eventName: string; eventDate: string | null; zoneNames: string[]; template: BadgeRow | null }) {
  const { run } = useAction(); const toast = useKitToast();
  const print = async () => {
    const w = window.open("", "_blank", "width=480,height=640");   // opened before the await so pop-up blockers allow it
    const r = await run(() => printBadge(pass.id), { refresh: true });
    if (!r.ok || !r.data) { w?.close(); return; }
    if (!w) { toast("Allow pop-ups to print badges.", "error"); return; }
    const show = new Set(template?.layout?.show ?? ["holder_name", "pass_type", "zones", "event_name", "code", "qr"]);
    // Q45: the accent is stored template data written into the popup <style> — only a plain colour may reach it.
    const accent = safeSvgColor(template?.layout?.accent, "#1b64f5"), size = template?.layout?.size ?? "cr80";
    const dims = size === "a6" ? ["105mm", "148mm"] : size === "a7" ? ["74mm", "105mm"] : ["54mm", "86mm"];
    const qr = show.has("qr") ? await QRCode.toDataURL(r.data.payload, { margin: 1, width: 360 }) : "";
    const line = (k: string, html: string) => (show.has(k) ? html : "");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Badge ${esc(r.data.code)}</title><style>@page{size:${dims[0]} ${dims[1]};margin:0}body{margin:0;font-family:system-ui,sans-serif}
      .b{width:${dims[0]};height:${dims[1]};box-sizing:border-box;padding:5mm;display:flex;flex-direction:column;gap:2mm;border-top:6mm solid ${accent}}
      .t{font-size:9pt;color:#555}.n{font-size:15pt;font-weight:700}.p{display:inline-block;background:${accent};color:#fff;font-weight:700;padding:1mm 3mm;border-radius:2mm;text-transform:uppercase;font-size:9pt}
      .z{font-size:8pt}.q{margin-top:auto;text-align:center}.q img{width:70%}.c{font:8pt monospace;text-align:center}</style></head><body><div class="b">
      ${line("event_name", `<div class="t">${esc(eventName)}</div>`)}${line("event_date", eventDate ? `<div class="t">${esc(new Date(eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</div>` : "")}
      ${line("holder_name", `<div class="n">${esc(pass.holder_name)}</div>`)}${line("pass_type", `<div><span class="p">${esc(pass.pass_type)}</span></div>`)}
      ${line("zones", zoneNames.length ? `<div class="z">${esc(zoneNames.join(" · "))}</div>` : "")}${line("organisation", `<div class="t">Issued via Gala Dock</div>`)}
      ${qr ? `<div class="q"><img alt="" src="${qr}"></div>` : ""}${line("code", `<div class="c">${esc(r.data.code)}</div>`)}</div></body></html>`);
    // Print from the opener once the badge (and its QR image) has loaded: an inline <script> in the popup would be blocked by the
    // nonce CSP the about:blank window inherits.
    w.addEventListener("load", () => w.print(), { once: true });
    w.document.close();
  };
  return <span className="ax-actions">
    {pass.status === "active" && <button type="button" className="k-icon-btn" aria-label={`Print badge for ${pass.holder_name}`} title="Print badge (recorded)" onClick={() => void print()}><Printer size={14} /></button>}
    {pass.status === "active" && <ActionButton label="Suspend" className="k-btn ghost sm" run={reason => revokePass(pass.id, reason, "suspended")} confirm={{ title: `Suspend ${pass.holder_name}'s pass?`, text: "Printed badges stop scanning until you reactivate the pass. After reactivating, print a new badge — the old printed badges stay dead.", cta: "Suspend pass" }} reason={{ label: "Reason" }} />}
    {pass.status !== "revoked" && <ActionButton label="Revoke" className="k-btn ghost sm" run={reason => revokePass(pass.id, reason, "revoked")} confirm={{ title: `Revoke ${pass.holder_name}'s pass?`, text: "Every printed badge for this pass stops scanning immediately.", cta: "Revoke pass", danger: true }} reason={{ label: "Reason", required: true }} />}
    {(pass.status === "suspended" || pass.status === "revoked") && <ActionButton label="Reactivate" className="k-btn ghost sm" run={() => revokePass(pass.id, "", "active")} confirm={{ title: `Reactivate ${pass.holder_name}'s pass?`, text: "The pass scans again. Print a new badge — previously printed badges stay dead.", cta: "Reactivate" }} />}
  </span>;
}

// ── Badge templates ───────────────────────────────────────────────────────────────────────────────────────────────
export function BadgeTemplateButton({ eventId, template }: { eventId: string; template?: BadgeRow }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const init = () => ({ name: template?.name ?? "", types: template?.pass_types ?? [], show: template?.layout?.show ?? ["holder_name", "pass_type", "zones", "event_name", "code", "qr"], size: template?.layout?.size ?? "cr80", accent: template?.layout?.accent ?? "#1b64f5" });
  const [f, setF] = useState(init);
  const save = async () => { const r = await run(() => saveBadgeTemplate(eventId, { name: f.name, pass_types: f.types, show: f.show, size: f.size, accent: f.accent }, template?.family_id)); if (r.ok) setOpen(false); };
  return <>
    {template ? <button type="button" className="k-btn ghost sm" aria-label={`New version of ${template.name}`} onClick={() => { setF(init()); setOpen(true); }}>New version</button>
      : <button type="button" className="k-btn outline sm" onClick={() => { setF(init()); setOpen(true); }}><Plus size={14} />Template</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title={template ? `New version of ${template.name}` : "New badge template"} sub={template ? `Saves v${template.version + 1}; v${template.version} stays in history.` : "Choose what the printed badge shows."}
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !f.name.trim() || !f.show.length} onClick={() => void save()}>Save template</button></>}>
      <div className="k-col" style={{ gap: 12 }}>
        <div className="k-grid k-g3">
          <label className="k-field"><span>Name <b>*</b></span><input className="k-input" value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Crew badge" /></label>
          <label className="k-field"><span>Size</span><select className="k-select" value={f.size} onChange={e => setF({ ...f, size: e.target.value })}><option value="cr80">Card (CR80)</option><option value="a7">A7</option><option value="a6">A6</option></select></label>
          <label className="k-field"><span>Accent colour</span><input className="k-input" type="color" value={f.accent} onChange={e => setF({ ...f, accent: e.target.value })} /></label>
        </div>
        <Checks label="Fields on the badge" options={BADGE_FIELDS} value={f.show} onChange={v => setF({ ...f, show: v })} />
        <Checks label="Default for pass types (none = any)" options={PASS_TYPES.map(p => [p, cap(p)] as const)} value={f.types} onChange={v => setF({ ...f, types: v })} />
        <p className="k-xs k-muted" style={{ margin: 0 }}>Contact, dietary and medical details can&apos;t be added to badges.</p>
      </div>
    </Dialog>
  </>;
}

// ── Door staff ────────────────────────────────────────────────────────────────────────────────────────────────────
export function ScannerButton({ eventId, zones }: { eventId: string; zones: Opt[] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false); const [f, setF] = useState({ email: "", zones: [] as string[], until: "" });
  const save = async () => { const r = await run(() => assignScannerByEmail(eventId, f.email, f.zones, toIso(f.until))); if (r.ok) { setOpen(false); setF({ email: "", zones: [], until: "" }); } };
  return <>
    <button type="button" className="k-btn outline sm" onClick={() => setOpen(true)}><UserPlus size={14} />Add door staff</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Give door staff check-in access" sub="They need a Gala Dock account. Access covers this event only."
      footer={<><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="k-btn primary" disabled={pending || !/^\S+@\S+\.\S+$/.test(f.email)} onClick={() => void save()}>Grant access</button></>}>
      <div className="k-col" style={{ gap: 12 }}>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Email <b>*</b></span><input className="k-input" type="email" value={f.email} maxLength={200} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          <label className="k-field"><span>Access ends</span><input className="k-input" type="datetime-local" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} /><small>Empty = until you remove it.</small></label>
        </div>
        {zones.length > 0 && <Checks label="Limit to zones (none = all zones)" options={zones.map(z => [z.id, z.name] as const)} value={f.zones} onChange={v => setF({ ...f, zones: v })} />}
        <p className="k-xs k-muted" style={{ margin: 0 }}>Zone-limited staff must choose one of their zones in the scanner. Re-assigning replaces their previous access.</p>
      </div>
    </Dialog>
  </>;
}
export function ScannerRevoke({ eventId, userId, name }: { eventId: string; userId: string; name: string }) {
  return <ActionButton label={`Remove door access for ${name}`} className="k-btn ghost sm" run={() => revokeScanner(eventId, userId)} confirm={{ title: `Remove ${name}'s door access?`, text: "They can no longer scan for this event. Their past scans stay in the check-in log.", cta: "Remove access", danger: true }}>Remove</ActionButton>;
}
