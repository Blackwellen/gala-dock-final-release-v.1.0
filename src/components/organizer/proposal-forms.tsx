"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2, Link2, Building2, Calendar, MapPin, Users, ArrowRight, Send, Info, Copy } from "lucide-react";
import { useAction, useKitToast } from "@/components/kit/client";
import { saveProposalClient, saveProposalPricing, sendProposal, type LineItem, type OptionItem } from "@/lib/actions/proposals";

type Lead = { id: string; name: string; client_name: string; contact_name: string; contact_email: string; event_type: string; expected_date: string | null; location: string; guests: string; budget: string };
export function ProposalClientForm({ id, initial, leads }: { id: string | null; initial: Record<string, string | boolean>; leads: Lead[] }) {
  const { run, pending } = useAction(); const [v, setV] = useState(initial);
  const set = (k: string, val: string | boolean) => setV(x => ({ ...x, [k]: val }));
  const pickLead = (lid: string) => { const l = leads.find(x => x.id === lid); set("lead_id", lid); if (l) setV(x => ({ ...x, lead_id: lid, title: x.title || l.name, client_name: l.client_name, contact_name: l.contact_name, contact_email: l.contact_email, event_type: l.event_type, date: l.expected_date ?? "", location: l.location, attendance: l.guests })); };
  const lead = leads.find(l => l.id === v.lead_id);
  return <form id="wz-form" className="wz-grid" onSubmit={async e => { e.preventDefault(); await run(() => saveProposalClient(id, v)); }}>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 12 }}><div><h2 className="wz-h">Client &amp; Contact</h2><p className="k-small">Select the client and main contact for this proposal.</p></div></div>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Client <b>*</b></span><div className="k-input-icon"><Building2 size={15} /><input className="k-input" value={String(v.client_name ?? "")} onChange={e => set("client_name", e.target.value)} required /></div></label>
          <label className="k-field"><span>Linked lead (optional)</span><select className="k-select" value={String(v.lead_id ?? "")} onChange={e => pickLead(e.target.value)}><option value="">No lead</option>{leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.client_name}</option>)}</select></label>
          <label className="k-field"><span>Primary contact <b>*</b></span><input className="k-input" value={String(v.contact_name ?? "")} onChange={e => set("contact_name", e.target.value)} /></label>
          <label className="k-field"><span>Contact email</span><input className="k-input" type="email" value={String(v.contact_email ?? "")} onChange={e => set("contact_email", e.target.value)} /></label>
        </div>
        {lead && <div className="k-notice purple" style={{ marginTop: 12 }}><Link2 size={15} className="k-purple" /><span><b>Prefilled from {lead.name}.</b> Budget {lead.budget || "not given"} · {lead.guests || "guests TBC"}. <Link className="k-link" href={`/organizer/sales/leads/${lead.id}`}>View original lead</Link></span></div>}</section>
      <section className="k-card"><h2 className="wz-h">Event details</h2><p className="k-small" style={{ marginBottom: 12 }}>Define the key details for the event this proposal is for.</p>
        <div className="k-grid k-g2">
          <label className="k-field"><span>Event name / concept <b>*</b></span><input className="k-input" value={String(v.title ?? "")} onChange={e => set("title", e.target.value)} required minLength={2} /><small>A clear working name for this event.</small></label>
          <label className="k-field"><span>Event type <b>*</b></span><select className="k-select" value={String(v.event_type ?? "Festival")} onChange={e => set("event_type", e.target.value)}>{["Festival", "Music Festival", "Corporate", "Conference", "Wedding", "Party", "Gala Dinner", "Networking", "Food & Drink"].map(t => <option key={t}>{t}</option>)}</select></label>
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
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href="/organizer/sales?tab=proposals">Cancel</Link><div className="k-row" style={{ gap: 10 }}><button className="k-btn primary lg" disabled={pending}>Continue to Offer &amp; Pricing <ArrowRight size={15} /></button></div></div>
  </form>;
}

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(n);
export function ProposalPricingForm({ id, initial, taxRate }: { id: string; initial: { line_items: LineItem[]; options: OptionItem[]; deposit_pct: number; valid_until: string; terms: Record<string, string> }; taxRate: number }) {
  const { run, pending } = useAction();
  const [items, setItems] = useState<LineItem[]>(initial.line_items.length ? initial.line_items : [["Venue & Site", "", 1, 0]]);
  const [opts, setOpts] = useState<OptionItem[]>(initial.options); const [dep, setDep] = useState(initial.deposit_pct); const [valid, setValid] = useState(initial.valid_until); const [terms, setTerms] = useState(initial.terms);
  const t = useMemo(() => { const sub = items.reduce((s, i) => s + i[2] * i[3], 0) + opts.filter(o => o[3]).reduce((s, o) => s + o[2], 0); const tax = sub * taxRate / 100; return { sub, tax, total: sub + tax, optSum: opts.filter(o => o[3]).reduce((s, o) => s + o[2], 0) }; }, [items, opts, taxRate]);
  const upd = <T extends unknown[]>(arr: T[], set: (x: T[]) => void, i: number, k: number, val: unknown) => set(arr.map((r, j) => (j === i ? (r.map((c, kk) => (kk === k ? val : c)) as T) : r)));
  return <form className="wz-grid" onSubmit={async e => { e.preventDefault(); await run(() => saveProposalPricing(id, { line_items: items, options: opts, deposit_pct: dep, valid_until: valid, terms })); }}>
    <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="wz-h">Line items</h2><p className="k-small">Priced scope of work. Totals are recalculated on the server when saved.</p></div><button type="button" className="k-btn outline sm" onClick={() => setItems([...items, ["", "", 1, 0]])}><Plus size={14} />Add item</button></div>
        <table className="k-table pr-edit"><thead><tr><th>#</th><th>Item</th><th>Description</th><th style={{ width: 70 }}>Qty</th><th style={{ width: 120 }}>Unit price</th><th className="num">Total</th><th /></tr></thead>
          <tbody>{items.map((it, i) => <tr key={i}><td>{i + 1}</td><td><input className="k-input" value={it[0]} onChange={e => upd(items, setItems, i, 0, e.target.value)} required aria-label={`Item ${i + 1} name`} /></td><td><input className="k-input" value={it[1]} onChange={e => upd(items, setItems, i, 1, e.target.value)} aria-label={`Item ${i + 1} description`} /></td><td><input className="k-input" type="number" min={0} value={it[2]} onChange={e => upd(items, setItems, i, 2, Number(e.target.value))} aria-label="Quantity" /></td><td><input className="k-input" type="number" min={0} step={50} value={it[3]} onChange={e => upd(items, setItems, i, 3, Number(e.target.value))} aria-label="Unit price" /></td><td className="num">{gbp(it[2] * it[3])}</td><td><button type="button" className="k-icon-btn plain" aria-label="Remove item" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></section>
      <section className="k-card"><div className="k-between" style={{ marginBottom: 10 }}><div><h2 className="wz-h">Options / add-ons</h2><p className="k-small">Optional extras the client can include.</p></div><button type="button" className="k-btn outline sm" onClick={() => setOpts([...opts, ["", "", 0, false]])}><Plus size={14} />Add option</button></div>
        <div className="k-col" style={{ gap: 8 }}>{opts.map((o, i) => <div key={i} className="pr-opt"><button type="button" role="switch" aria-checked={o[3]} aria-label="Include option" className="k-toggle" onClick={() => upd(opts, setOpts, i, 3, !o[3])} /><input className="k-input" value={o[0]} onChange={e => upd(opts, setOpts, i, 0, e.target.value)} placeholder="Option name" required /><input className="k-input" value={o[1]} onChange={e => upd(opts, setOpts, i, 1, e.target.value)} placeholder="Description" /><input className="k-input" type="number" min={0} value={o[2]} onChange={e => upd(opts, setOpts, i, 2, Number(e.target.value))} aria-label="Option price" style={{ width: 110 }} /><button type="button" className="k-icon-btn plain" aria-label="Remove option" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><Trash2 size={14} /></button></div>)}{!opts.length && <p className="k-small">No options.</p>}</div></section>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 10 }}>Terms</h2><div className="k-grid k-g2">
        {([["validity", "Validity period"], ["payment", "Payment terms"], ["cancellation", "Cancellation"], ["assumptions", "Assumptions"], ["exclusions", "Exclusions"]] as const).map(([k, l]) => <label key={k} className="k-field" style={k === "assumptions" || k === "exclusions" ? { gridColumn: "1/-1" } : undefined}><span>{l}</span><input className="k-input" value={terms[k] ?? ""} onChange={e => setTerms({ ...terms, [k]: e.target.value })} /></label>)}</div></section>
    </div>
    <div className="k-col" style={{ gap: 14 }}>
      <section className="k-card"><h2 className="wz-h" style={{ marginBottom: 10 }}>Financial summary</h2>
        <table className="k-table"><tbody><tr><td>Subtotal (items)</td><td className="num">{gbp(t.sub - t.optSum)}</td></tr><tr><td>Options ({opts.filter(o => o[3]).length})</td><td className="num">{gbp(t.optSum)}</td></tr><tr><td>Total (ex. VAT)</td><td className="num"><b>{gbp(t.sub)}</b></td></tr><tr><td>VAT ({taxRate}%)</td><td className="num">{gbp(t.tax)}</td></tr><tr><td><b>Total (inc. VAT)</b></td><td className="num"><b>{gbp(t.total)}</b></td></tr></tbody></table>
        <label className="k-field" style={{ marginTop: 12 }}><span>Deposit required (%)</span><input className="k-input" type="number" min={0} max={100} value={dep} onChange={e => setDep(Number(e.target.value))} /><small>{gbp(t.total * dep / 100)} due on acceptance</small></label>
        <label className="k-field" style={{ marginTop: 10 }}><span>Valid until</span><input className="k-input" type="date" value={valid} onChange={e => setValid(e.target.value)} required /></label>
        <div className="k-notice" style={{ marginTop: 12 }}><Info size={14} className="k-blue" /><span className="k-xs">VAT rate comes from your workspace tax settings ({taxRate}%). Change it in Settings › Payments.</span></div></section>
    </div>
    <div className="wz-foot" style={{ gridColumn: "1 / -1" }}><Link className="k-btn ghost lg" href={`/organizer/proposals/new?step=1&id=${id}`}>Back</Link><button className="k-btn primary lg" disabled={pending}>Continue to Review &amp; Send <ArrowRight size={15} /></button></div>
  </form>;
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
