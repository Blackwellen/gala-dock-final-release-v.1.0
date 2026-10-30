"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2, Link2, Building2, Calendar, MapPin, Users, ArrowRight, ArrowLeft, Send, Info, Copy, X, ExternalLink, Monitor, Smartphone, CheckCircle2 } from "lucide-react";
import { useAction, useKitToast } from "@/components/kit/client";
import { labelOf, resolveTerm, terms } from "@/lib/master-data";
import { saveProposalClient, saveProposalServices, saveProposalTerms, saveProposalPresentation, sendProposal, type LineItem, type OptionItem, type ProposalPresentation, type ProposalPackage } from "@/lib/actions/proposals";

type Lead = { id: string; name: string; client_name: string; contact_name: string; contact_email: string; event_type: string; expected_date: string | null; location: string; guests: string; budget: string; stage?: string };
// Proposal event type is label-valued: the designed shortlist first, then every other canonical event type (master data).
const DESIGNED_TYPES = ["Festival", "Music Festival", "Corporate", "Conference", "Wedding", "Party", "Gala Dinner", "Networking", "Food & Drink"];
const PROPOSAL_TYPES = [...DESIGNED_TYPES, ...terms("event_type").filter(t => !DESIGNED_TYPES.some(d => resolveTerm("event_type", d) === t.key)).map(t => t.label)];
const STAGE: Record<string, string> = { new: "New", qualified: "Qualified", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost" };
export function ProposalClientForm({ id, initial, leads }: { id: string | null; initial: Record<string, string | boolean>; leads: Lead[] }) {
  const { run, pending } = useAction(); const [v, setV] = useState(initial);
  const set = (k: string, val: string | boolean) => setV(x => ({ ...x, [k]: val }));
  const pickLead = (lid: string) => { const l = leads.find(x => x.id === lid); set("lead_id", lid); if (l) setV(x => ({ ...x, lead_id: lid, title: x.title || l.name, client_name: l.client_name, contact_name: l.contact_name, contact_email: l.contact_email, event_type: labelOf("event_type", l.event_type, "Event"), date: l.expected_date ?? "", location: l.location, attendance: l.guests })); };
  const lead = leads.find(l => l.id === v.lead_id);
  const eventType = labelOf("event_type", v.event_type, "Festival"); // a lead may carry a key ("awards") rather than a label
  return <form id="wz-form" className="wz-grid" onSubmit={async e => { e.preventDefault(); await run(() => saveProposalClient(id, { ...v, event_type: eventType })); }}>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 12 }}><div><h2 className="wz-h">Client &amp; Contact</h2><p className="k-small">Select the client and main contact for this proposal.</p></div></div>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Client <b>*</b></span><div className="k-input-icon"><Building2 size={15} /><input className="k-input" value={String(v.client_name ?? "")} onChange={e => set("client_name", e.target.value)} required /></div></label>
          <div className="k-field"><span>Linked lead (optional)</span>
            {lead ? <div className="pr-lead" aria-label="Linked lead"><span className="pr-lead-ic"><Link2 size={16} /></span><span className="k-grow"><b>{lead.name}</b><small>{lead.client_name}{lead.expected_date ? ` · ${new Date(`${lead.expected_date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</small></span>{lead.stage && <span className="pr-lead-st">{STAGE[lead.stage] ?? lead.stage}</span>}<button type="button" className="k-icon-btn plain" aria-label="Unlink lead" onClick={() => set("lead_id", "")}><X size={14} /></button></div>
              : <select className="k-select" aria-label="Link from lead" value="" onChange={e => pickLead(e.target.value)}><option value="">{leads.length ? "Link from lead…" : "No open leads"}</option>{leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.client_name}</option>)}</select>}
            {lead && <Link className="k-link pr-lead-link" href={`/organizer/sales/leads/${lead.id}`}>View original lead <ExternalLink size={12} /></Link>}</div>
          <label className="k-field"><span>Primary contact <b>*</b></span><input className="k-input" value={String(v.contact_name ?? "")} onChange={e => set("contact_name", e.target.value)} /></label>
          <label className="k-field"><span>Contact email</span><input className="k-input" type="email" value={String(v.contact_email ?? "")} onChange={e => set("contact_email", e.target.value)} /></label>
        </div>
        {lead && <div className="pr-lead-sum"><b>Lead summary</b><ul>{[lead.event_type && `${lead.event_type} for ${lead.guests || "TBC"} guests`, lead.location && `Location: ${lead.location}`, `Budget: ${lead.budget || "not given"}`, lead.contact_name && `Contact: ${lead.contact_name}${lead.contact_email ? ` (${lead.contact_email})` : ""}`].filter(Boolean).map(t => <li key={t as string}>{t}</li>)}</ul></div>}</section>
      <section className="k-card"><h2 className="wz-h">Event details</h2><p className="k-small" style={{ marginBottom: 12 }}>Define the key details for the event this proposal is for.</p>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Event name / concept <b>*</b></span><input className="k-input" value={String(v.title ?? "")} onChange={e => set("title", e.target.value)} required minLength={2} /><small>A clear working name for this event.</small></label>
          <label className="k-field"><span>Event type <b>*</b></span><select className="k-select" value={eventType} onChange={e => set("event_type", e.target.value)}>{(PROPOSAL_TYPES.includes(eventType) ? PROPOSAL_TYPES : [eventType, ...PROPOSAL_TYPES]).map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="k-field"><span>Proposed date <b>*</b></span><div className="k-input-icon"><Calendar size={15} /><input className="k-input" type="date" value={String(v.date ?? "")} onChange={e => set("date", e.target.value)} required /></div></label>
          <label className="k-check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={!!v.flexible} onChange={e => set("flexible", e.target.checked)} /><span><b>Flexible dates</b><br /><small>Client is open to alternative dates</small></span></label>
          <label className="k-field"><span>Location <b>*</b></span><div className="k-input-icon"><MapPin size={15} /><input className="k-input" value={String(v.location ?? "")} onChange={e => set("location", e.target.value)} required /></div></label>
          <label className="k-field"><span>Venue (optional)</span><input className="k-input" value={String(v.venue ?? "")} onChange={e => set("venue", e.target.value)} placeholder="Select a venue or keep open" /></label>
          <label className="k-field"><span>Expected attendance <b>*</b></span><div className="k-input-icon"><Users size={15} /><input className="k-input" value={String(v.attendance ?? "")} onChange={e => set("attendance", e.target.value)} required /></div></label>
          <label className="k-field"><span>Attendance type</span><select className="k-select" value={String(v.attendance_type ?? "General public")} onChange={e => set("attendance_type", e.target.value)}>{["General public", "Invite only", "Standing (mix)", "Seated", "Corporate guests"].map(t => <option key={t}>{t}</option>)}</select></label>
        </div></section>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 10 }}>Quick summary</h2>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/gd/pw-wedding-side.webp" alt="" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10 }} />
        <h3 style={{ fontSize: 15.5, margin: "10px 0" }}>{String(v.title || "Untitled proposal")}</h3>
        <dl className="ov-dl">{[["Client", v.client_name], ["Contact", v.contact_name], ["Date", v.date], ["Location", v.location], ["Attendance", v.attendance], ["Event type", v.event_type]].map(([k, val]) => <div key={String(k)}><dt>{String(k)}</dt><dd>{String(val || "—")}</dd></div>)}</dl></section>
      <section className="k-card"><div className="k-between"><h2 className="wz-h">Event brief</h2><span className="k-xs k-muted">{String(v.summary ?? "").length}/1000</span></div><textarea className="k-textarea" style={{ minHeight: 140, marginTop: 8 }} maxLength={1000} value={String(v.summary ?? "")} onChange={e => set("summary", e.target.value)} placeholder="Describe the event, your client's goals and any specific requirements." /></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href="/organizer/sales?tab=proposals">Cancel</Link><div className="k-row" style={{ gap: 10 }}><button className="k-btn primary lg" disabled={pending}>Continue to Services &amp; Options <ArrowRight size={15} /></button></div></div>
  </form>;
}

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(n);
const back = (id: string, n: number) => `/organizer/proposals/new?step=${n}&id=${id}`;

/** Step 2 — Services & Options: the priced scope (line items) and optional add-ons. Totals are recomputed on the server. */
export function ProposalServicesForm({ id, initial, taxRate }: { id: string; initial: { line_items: LineItem[]; options: OptionItem[]; packages?: ProposalPackage[] }; taxRate: number }) {
  const { run, pending } = useAction();
  const [pkgs, setPkgs] = useState<ProposalPackage[]>(initial.packages ?? []);
  const setPkg = (i: number, patch: Partial<ProposalPackage>) => setPkgs(pkgs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [items, setItems] = useState<LineItem[]>(initial.line_items.length ? initial.line_items : [["Venue & Site", "", 1, 0]]);
  const [opts, setOpts] = useState<OptionItem[]>(initial.options);
  const t = useMemo(() => { const optSum = opts.filter(o => o[3]).reduce((s, o) => s + o[2], 0); const sub = items.reduce((s, i) => s + i[2] * i[3], 0) + optSum; return { sub, optSum, tax: sub * taxRate / 100, total: sub * (1 + taxRate / 100) }; }, [items, opts, taxRate]);
  const upd = <T extends unknown[]>(arr: T[], set: (x: T[]) => void, i: number, k: number, val: unknown) => set(arr.map((r, j) => (j === i ? (r.map((c, kk) => (kk === k ? val : c)) as T) : r)));
  const priced = items.some(i => i[0].trim() && i[2] * i[3] > 0) || pkgs.some(x => x.name.trim() && x.price > 0);
  return <form className="wz-grid" onSubmit={async e => { e.preventDefault(); await run(() => saveProposalServices(id, { line_items: items.filter(i => i[0].trim()), options: opts, packages: pkgs })); }}>
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="wz-h">Services &amp; line items</h2><p className="k-small">Venues, suppliers and setup you are quoting for. Totals are recalculated on the server when saved.</p></div><button type="button" className="k-btn outline sm" onClick={() => setItems([...items, ["", "", 1, 0]])}><Plus size={14} />Add item</button></div>
        <div className="k-table-wrap"><table className="k-table pr-edit"><thead><tr><th>#</th><th>Item</th><th>Description</th><th style={{ width: 70 }}>Qty</th><th style={{ width: 120 }}>Unit price</th><th className="num">Total</th><th /></tr></thead>
          <tbody>{items.map((it, i) => <tr key={i}><td>{i + 1}</td><td><input className="k-input" value={it[0]} onChange={e => upd(items, setItems, i, 0, e.target.value)} required aria-label={`Item ${i + 1} name`} /></td><td><input className="k-input" value={it[1]} onChange={e => upd(items, setItems, i, 1, e.target.value)} aria-label={`Item ${i + 1} description`} /></td><td><input className="k-input" type="number" min={0} value={it[2]} onChange={e => upd(items, setItems, i, 2, Number(e.target.value))} aria-label="Quantity" /></td><td><input className="k-input" type="number" min={0} step={50} value={it[3]} onChange={e => upd(items, setItems, i, 3, Number(e.target.value))} aria-label="Unit price" /></td><td className="num">{gbp(it[2] * it[3])}</td><td><button type="button" className="k-icon-btn plain" aria-label="Remove item" disabled={items.length === 1 && !pkgs.length} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
        {!priced && <p className="k-small k-amber" role="alert" style={{ marginTop: 8 }}>Add at least one priced item or package to continue.</p>}</section>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="wz-h">Options / add-ons</h2><p className="k-small">Optional extras the client can include.</p></div><button type="button" className="k-btn outline sm" onClick={() => setOpts([...opts, ["", "", 0, false]])}><Plus size={14} />Add option</button></div>
        <div className="k-col" style={{ gap: 8 }}>{opts.map((o, i) => <div key={i} className="pr-opt"><button type="button" role="switch" aria-checked={o[3]} aria-label="Include option" className="k-toggle" onClick={() => upd(opts, setOpts, i, 3, !o[3])} /><input className="k-input" value={o[0]} onChange={e => upd(opts, setOpts, i, 0, e.target.value)} placeholder="Option name" required /><input className="k-input" value={o[1]} onChange={e => upd(opts, setOpts, i, 1, e.target.value)} placeholder="Description" /><input className="k-input" type="number" min={0} value={o[2]} onChange={e => upd(opts, setOpts, i, 2, Number(e.target.value))} aria-label="Option price" style={{ width: 110 }} /><button type="button" className="k-icon-btn plain" aria-label="Remove option" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><Trash2 size={14} /></button></div>)}{!opts.length && <p className="k-small">No options.</p>}</div></section>
      <section className="k-card" aria-label="Packages comparison"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="wz-h">Packages (optional)</h2><p className="k-small">Bronze / Silver / Gold tiers priced on top of the items above. The client chooses one when accepting.</p></div><button type="button" className="k-btn outline sm" disabled={pkgs.length >= 4} onClick={() => { const tier = (["bronze", "silver", "gold", "custom"] as const)[Math.min(pkgs.length, 3)]; setPkgs([...pkgs, { key: `${tier}${pkgs.length ? `-${pkgs.length}` : ""}`, tier, name: tier[0]!.toUpperCase() + tier.slice(1), description: "", price: 0, items: [], recommended: false }]); }}><Plus size={14} />Add package</button></div>
        <div className="k-col" style={{ gap: 8 }}>{pkgs.map((x, i) => <div key={x.key} className="pr-opt" style={{ flexWrap: "wrap" }}><select className="k-select" aria-label="Tier" value={x.tier} onChange={e => setPkg(i, { tier: e.target.value as ProposalPackage["tier"] })} style={{ width: 110 }}>{["bronze", "silver", "gold", "custom"].map(t => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</select><input className="k-input" value={x.name} onChange={e => setPkg(i, { name: e.target.value })} placeholder="Package name" aria-label="Package name" required /><input className="k-input" type="number" min={0} value={x.price} onChange={e => setPkg(i, { price: Number(e.target.value) })} aria-label="Package price" style={{ width: 120 }} /><input className="k-input" value={x.items.join(", ")} onChange={e => setPkg(i, { items: e.target.value.split(",").map(v => v.trim()).filter(Boolean).slice(0, 20) })} placeholder="Included (comma separated)" aria-label="Included in package" style={{ flex: "1 1 240px" }} /><label className="k-check"><input type="checkbox" checked={x.recommended} onChange={e => setPkgs(pkgs.map((y, j) => ({ ...y, recommended: j === i ? e.target.checked : false })))} /><span>Recommended</span></label><button type="button" className="k-icon-btn plain" aria-label="Remove package" onClick={() => setPkgs(pkgs.filter((_, j) => j !== i))}><Trash2 size={14} /></button></div>)}{!pkgs.length && <p className="k-small">No packages — the client accepts the items above.</p>}</div></section>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 10 }}>Running total</h2>
        <table className="k-table"><tbody><tr><td>Items ({items.length})</td><td className="num">{gbp(t.sub - t.optSum)}</td></tr><tr><td>Options included ({opts.filter(o => o[3]).length})</td><td className="num">{gbp(t.optSum)}</td></tr><tr><td>Total (ex. VAT)</td><td className="num"><b>{gbp(t.sub)}</b></td></tr><tr><td>VAT ({taxRate}%)</td><td className="num">{gbp(t.tax)}</td></tr><tr><td><b>Total (inc. VAT)</b></td><td className="num"><b>{gbp(t.total)}</b></td></tr></tbody></table>
        <p className="k-xs k-muted" style={{ marginTop: 10 }}>Deposit, validity and terms come next.</p></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href={back(id, 1)}><ArrowLeft size={15} />Back</Link><button className="k-btn primary lg" disabled={pending || !priced}>Continue to Pricing &amp; Terms <ArrowRight size={15} /></button></div>
  </form>;
}

/** Step 3 — Pricing & Terms: deposit, validity and the commercial terms, against the saved totals. */
export function ProposalTermsForm({ id, initial, totals, taxRate }: { id: string; initial: { deposit_pct: number; valid_until: string; terms: Record<string, string> }; totals: { subtotal: number; tax: number; total: number }; taxRate: number }) {
  const { run, pending } = useAction();
  const [dep, setDep] = useState(initial.deposit_pct); const [valid, setValid] = useState(initial.valid_until); const [terms, setTerms] = useState(initial.terms);
  const today = new Date().toISOString().slice(0, 10); const bad = !valid || valid < today || dep < 0 || dep > 100;
  return <form className="wz-grid" onSubmit={async e => { e.preventDefault(); await run(() => saveProposalTerms(id, { deposit_pct: dep, valid_until: valid, terms })); }}>
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 10 }}>Payment terms</h2><div className="k-grid k-g2">
        <label className="k-field"><span>Deposit required (%)</span><input className="k-input" type="number" min={0} max={100} value={dep} onChange={e => setDep(Number(e.target.value))} /><small>{gbp(totals.total * dep / 100)} due on acceptance · balance {gbp(totals.total * (100 - dep) / 100)}</small></label>
        <label className="k-field"><span>Valid until <b>*</b></span><input className="k-input" type="date" min={today} value={valid} onChange={e => setValid(e.target.value)} required />{valid && valid < today && <small className="k-red" role="alert">Choose a date in the future.</small>}</label>
      </div></section>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 10 }}>Terms</h2><div className="k-grid k-g2">
        {([["validity", "Validity period"], ["payment", "Payment terms"], ["cancellation", "Cancellation"], ["assumptions", "Assumptions"], ["exclusions", "Exclusions"]] as const).map(([k, l]) => <label key={k} className="k-field" style={k === "assumptions" || k === "exclusions" ? { gridColumn: "1/-1" } : undefined}><span>{l}</span>{k === "assumptions" || k === "exclusions" ? <textarea className="k-textarea" maxLength={500} value={terms[k] ?? ""} onChange={e => setTerms({ ...terms, [k]: e.target.value })} /> : <input className="k-input" value={terms[k] ?? ""} onChange={e => setTerms({ ...terms, [k]: e.target.value })} />}</label>)}</div></section>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 10 }}>Pricing summary</h2>
        <table className="k-table"><tbody><tr><td>Subtotal</td><td className="num">{gbp(totals.subtotal)}</td></tr><tr><td>VAT ({taxRate}%)</td><td className="num">{gbp(totals.tax)}</td></tr><tr><td><b>Total (GBP)</b></td><td className="num"><b>{gbp(totals.total)}</b></td></tr><tr><td>Deposit ({dep}%)</td><td className="num">{gbp(totals.total * dep / 100)}</td></tr></tbody></table>
        <div className="k-notice" style={{ marginTop: 12 }}><Info size={14} className="k-blue" /><span className="k-xs">VAT rate comes from your workspace tax settings ({taxRate}%). Change it in Settings › Payments.</span></div>
        <Link className="k-link k-small" style={{ display: "inline-block", marginTop: 10 }} href={back(id, 2)}>Edit services and options</Link></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href={back(id, 2)}><ArrowLeft size={15} />Back</Link><button className="k-btn primary lg" disabled={pending || bad}>Continue to Presentation <ArrowRight size={15} /></button></div>
  </form>;
}

const TEMPLATES = [["modern", "Modern (Default)"], ["classic", "Classic"], ["minimal", "Minimal"]] as const;
const SECTIONS = [["overview", "Event overview"], ["items", "Priced items"], ["options", "Options / add-ons"], ["terms", "Key terms"], ["next_steps", "Next steps"]] as const;
const COVERS = ["/assets/gd/pw-wedding-side.webp", "/assets/gd/oe-neon.webp"];

/** Step 4 — Presentation: how the client sees the proposal (template, colour, cover, headline, sections), with a live preview. */
export function ProposalPresentationForm({ id, initial, preview }: { id: string; initial: ProposalPresentation; preview: { workspace: string; number: string; title: string; client: string; date: string; place: string; attendance: string; summary: string; items: LineItem[]; options: OptionItem[]; total: number; deposit: number; terms: Record<string, string>; covers: string[] } }) {
  const { run, pending } = useAction(); const [v, setV] = useState<ProposalPresentation>(initial); const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const covers = [...new Set([...preview.covers, ...COVERS])].slice(0, 4);
  const on = (k: ProposalPresentation["sections"][number]) => v.sections.includes(k);
  return <form className="wz-grid" onSubmit={async e => { e.preventDefault(); await run(() => saveProposalPresentation(id, v)); }}>
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><h2 className="wz-h">Brand &amp; presentation</h2><p className="k-small" style={{ marginBottom: 12 }}>Choose how your client sees this proposal.</p>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Template</span><select className="k-select" value={v.template} onChange={e => setV({ ...v, template: e.target.value as ProposalPresentation["template"] })}>{TEMPLATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="k-field"><span>Primary colour</span><span className="k-row" style={{ gap: 8 }}><input type="color" aria-label="Primary colour" value={v.color} onChange={e => setV({ ...v, color: e.target.value })} className="pr-color" /><input className="k-input" value={v.color} onChange={e => setV({ ...v, color: e.target.value })} aria-label="Primary colour hex" pattern="#[0-9a-fA-F]{6}" /></span></label>
          <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Headline</span><input className="k-input" maxLength={160} value={v.headline} onChange={e => setV({ ...v, headline: e.target.value })} placeholder="e.g. An unforgettable evening of music, dining and celebration" /></label>
        </div>
        <div className="k-field" style={{ marginTop: 12 }}><span>Cover image</span><div className="pr-covers" role="radiogroup" aria-label="Cover image">{covers.map(c => <button key={c} type="button" role="radio" aria-checked={v.cover === c} data-on={v.cover === c || undefined} onClick={() => setV({ ...v, cover: c })}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c} alt="" /></button>)}<button type="button" role="radio" aria-checked={!v.cover} data-on={!v.cover || undefined} className="pr-cover-none" onClick={() => setV({ ...v, cover: "" })}>No cover</button></div></div></section>
      <section className="k-card"><h2 className="wz-h">Sections</h2><p className="k-small" style={{ marginBottom: 10 }}>Priced items are always shown.</p>
        <div className="k-col" style={{ gap: 8 }}>{SECTIONS.map(([k, l]) => <label key={k} className="k-check"><input type="checkbox" checked={on(k)} disabled={k === "items"} onChange={e => setV({ ...v, sections: e.target.checked ? [...v.sections, k] : v.sections.filter(x => x !== k) })} /><span>{l}</span></label>)}</div></section>
    </div>
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 10 }}><h2 className="wz-h">Proposal preview</h2><div className="k-seg" role="group" aria-label="Preview size">{([["desktop", "Desktop", Monitor], ["mobile", "Mobile", Smartphone]] as const).map(([k, l, I]) => <button key={k} type="button" aria-pressed={device === k} aria-current={device === k ? "page" : undefined} onClick={() => setDevice(k)}><I size={14} />{l}</button>)}</div></div>
        <ProposalPreview v={v} p={preview} device={device} /></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href={back(id, 3)}><ArrowLeft size={15} />Back</Link><button className="k-btn primary lg" disabled={pending || !/^#[0-9a-fA-F]{6}$/.test(v.color)}>Continue to Review &amp; Send <ArrowRight size={15} /></button></div>
  </form>;
}

/** Client-facing preview drawn from the saved proposal and the presentation settings (also used on Review & Send). */
export function ProposalPreview({ v, p, device = "desktop" }: { v: ProposalPresentation; p: { workspace: string; number: string; title: string; client: string; date: string; place: string; attendance: string; summary: string; items: LineItem[]; options: OptionItem[]; total: number; deposit: number; terms: Record<string, string> }; device?: "desktop" | "mobile" }) {
  const show = (k: ProposalPresentation["sections"][number]) => v.sections.includes(k);
  return <div className={`pr-pv pr-pv-${v.template} ${device === "mobile" ? "mobile" : ""}`} style={{ ["--pr-c" as string]: v.color }}>
    <div className="pr-pv-head"><b>{p.workspace}</b><span><b>PROPOSAL</b><small>{p.number}</small></span></div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {v.cover && <img className="pr-pv-cover" src={v.cover} alt="" />}
    <h3>{p.title}</h3>{v.headline && <p className="pr-pv-tag">{v.headline}</p>}
    <div className="pr-pv-facts"><span><Calendar size={13} />{p.date || "TBC"}</span><span><MapPin size={13} />{p.place || "TBC"}</span><span><Users size={13} />{p.attendance || "—"}</span></div>
    {show("overview") && p.summary && <><h4>Event overview</h4><p className="pr-pv-p">{p.summary}</p></>}
    <h4>Your quote</h4><ul className="pr-pv-items">{p.items.map((it, i) => <li key={i}><span>{it[0]}</span><b>{gbp(it[2] * it[3])}</b></li>)}{show("options") && p.options.filter(o => o[3]).map((o, i) => <li key={`o${i}`}><span>{o[0]} <em>Option</em></span><b>{gbp(o[2])}</b></li>)}</ul>
    <div className="pr-pv-total"><span>Total (inc. VAT)</span><b>{gbp(p.total)}</b></div><small className="pr-pv-dep">{p.deposit}% deposit on acceptance</small>
    {show("terms") && Object.values(p.terms).some(Boolean) && <><h4>Key terms</h4><ul className="pr-pv-terms">{Object.entries(p.terms).filter(([, t]) => t).slice(0, 4).map(([k, t]) => <li key={k}><b>{k[0]!.toUpperCase() + k.slice(1)}:</b> {t}</li>)}</ul></>}
    {show("next_steps") && <><h4>Next steps</h4><ol className="pr-pv-next"><li><CheckCircle2 size={13} />Review the proposal</li><li><CheckCircle2 size={13} />Accept and pay the deposit</li><li><CheckCircle2 size={13} />We start detailed planning</li></ol></>}
  </div>;
}

export function SendProposalForm({ id, defaultTo, shareUrl, locked }: { id: string; defaultTo: string; shareUrl: string | null; locked: boolean }) {
  const { run, pending } = useAction(); const toast = useKitToast();
  return <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await run(() => sendProposal(id, String(f.get("to")), String(f.get("message")))); }}>
    <label className="k-field"><span>Recipient <b>*</b></span><input className="k-input" type="email" name="to" defaultValue={defaultTo} required disabled={locked} /></label>
    <label className="k-field"><span>Message</span><textarea className="k-textarea" name="message" defaultValue="Hi, please find our proposal attached. Happy to talk through any questions." disabled={locked} /></label>
    <div className="k-notice amber"><Info size={14} className="k-amber" /><span className="k-xs">Sending issues an immutable version. Email delivery isn&apos;t configured on this environment — share the secure client link below to collect acceptance.</span></div>
    {shareUrl && <button type="button" className="k-btn outline" onClick={async () => { try { await navigator.clipboard.writeText(location.origin + shareUrl); toast("Client link copied"); } catch { toast(location.origin + shareUrl); } }}><Copy size={14} />Copy client link</button>}
    <button className="k-btn primary lg" disabled={pending || locked}><Send size={15} />{locked ? "Already issued" : "Send proposal"}</button>
  </form>;
}
