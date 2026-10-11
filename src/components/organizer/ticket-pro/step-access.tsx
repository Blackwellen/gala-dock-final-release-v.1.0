"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat, ShieldCheck, Info, CalendarDays, ChevronDown, GripVertical, Plus, CheckCircle2, AlertTriangle, Landmark, Pencil, Accessibility, Gift, Users, X } from "lucide-react";
import { Toggle, useAction } from "@/components/kit/client";
import { saveAccess } from "@/lib/actions/ticket-pro";
import { TERMS_TEMPLATES, feeExample, type ProSettings } from "@/lib/ticket-pro-model";
import type { ProSetup } from "@/lib/data/ticket-pro";
import { Card, Footer, gbp2, toLocal, fromLocal, uid } from "./ui";

type A = ProSettings["access"];

export function StepAccess({ data, base }: { data: ProSetup; base: string }) {
  const router = useRouter(); const { run, pending } = useAction(); const e = data.event;
  const [a, setA] = useState<A>(() => ({ ...data.pro.access, refund_cutoff: data.pro.access.refund_cutoff ?? (e.starts_at ? new Date(Date.parse(e.starts_at) - 864e5).toISOString() : null), age_text: data.pro.access.age_text || (data.pro.sales.min_age ? `${data.pro.sales.min_age}+ only` : "") }));
  const set = (p: Partial<A>) => setA(x => ({ ...x, ...p }));
  const ex = data.tiers.find(t => t.price > 0); const f = feeExample(ex?.price ?? 35, a.fee_display);
  const save = async (next: boolean) => { const r = await run(() => saveAccess(e.id, a), { refresh: false }); if (r.ok) router.push(next ? `${base}?step=5` : `/organizer/events/${e.id}?tab=sell`); };
  const accessibleSecs = data.pro.sections.filter(s => s.type === "accessible").reduce((n, s) => n + s.capacity, 0);
  const holdSecs = data.pro.sections.filter(s => s.type === "hold").reduce((n, s) => n + s.capacity, 0);

  return <>
    <div className="tp-g3a">
      <Card title="Transfer & resale" sub="Control whether and how tickets can be transferred or resold.">
        <div className="tp-opt"><span className="tp-oi"><Repeat size={15} /></span><span><b>Allow ticket transfers</b><small>Let buyers transfer tickets to friends.</small></span><Toggle checked={a.transfers} onChange={v => set({ transfers: v })} label="Allow ticket transfers" /></div>
        <div className="tp-opt"><span className="tp-oi"><ShieldCheck size={15} /></span><span><b>Official resale marketplace</b><small>Enable resale through Gala Dock (recommended).</small></span><Toggle checked={a.resale} onChange={v => set({ resale: v })} label="Official resale marketplace" /></div>
        <div className="tp-g3f">
          <label className="tp-f"><span>Resale price limit</span><span className="tp-in sel"><select disabled={!a.resale} value={a.resale_cap} onChange={x => set({ resale_cap: Number(x.target.value) as A["resale_cap"] })}>{[100, 110, 120, 150].map(v => <option key={v} value={v}>{v === 100 ? "Face value only" : `Up to ${v}% of face value`}</option>)}</select><ChevronDown size={13} /></span></label>
          <label className="tp-f"><span>Resale fee (buyer)</span><span className="tp-in sel"><select disabled={!a.resale} value={a.fee_buyer} onChange={x => set({ fee_buyer: Number(x.target.value) })}>{[0, 2.5, 5, 7.5, 10].map(v => <option key={v} value={v}>{v}% (platform)</option>)}</select><ChevronDown size={13} /></span></label>
          <label className="tp-f"><span>Resale fee (seller)</span><span className="tp-in sel"><select disabled={!a.resale} value={a.fee_seller} onChange={x => set({ fee_seller: Number(x.target.value) })}>{[0, 2.5, 5, 7.5, 10].map(v => <option key={v} value={v}>{v}% (platform)</option>)}</select><ChevronDown size={13} /></span></label>
        </div>
        <p className="tp-note"><Info size={13} />Resale is only allowed through the official Gala Dock marketplace to prevent fraud and ensure a safe experience.</p>
      </Card>
      <Card title="Refund & cancellation policy" sub="Set refund rules for buyers. These will be shown at checkout.">
        <div className="tp-radios" role="radiogroup" aria-label="Refund policy">{([["none", "No refunds", "All ticket sales are final."], ["date", "Refunds up to a date", "Full or partial refunds available until a set date."], ["flexible", "Flexible refunds", "Allow refunds up to 24 hours before the event."], ["cancel", "Event cancellation only", "Refunds only if the event is cancelled."]] as const).map(([k, t, d]) =>
          <button key={k} role="radio" aria-checked={a.refund === k} data-on={a.refund === k || undefined} onClick={() => set({ refund: k })}><i /><span><b>{t}</b><small>{d}</small></span></button>)}</div>
        {a.refund === "date" && <div className="tp-g2f"><label className="tp-f"><span>Refund cut-off date</span><span className="tp-in ic"><CalendarDays size={14} /><input type="datetime-local" value={toLocal(a.refund_cutoff)} onChange={x => set({ refund_cutoff: fromLocal(x.target.value) })} /></span></label>
          <label className="tp-f"><span>Refund amount</span><span className="tp-in sel"><select value={a.refund_amount} onChange={x => set({ refund_amount: Number(x.target.value) as 100 | 50 })}><option value={100}>100% (full refund)</option><option value={50}>50% (partial refund)</option></select><ChevronDown size={13} /></span></label></div>}
      </Card>
      <Card title="Holds, comps & accessibility" sub="Reserve tickets for guests and make sure every buyer can attend.">
        <div className="tp-opt"><span className="tp-oi"><Gift size={15} /></span><span><b>Complimentary tickets</b><small>Staff, press and special guests (issued from holds).</small></span><span className="tp-in xs"><input inputMode="numeric" aria-label="Complimentary tickets" value={a.comps} onChange={x => set({ comps: Number(x.target.value.replace(/\D/g, "")) || 0 })} /></span></div>
        <div className="tp-opt"><span className="tp-oi"><Accessibility size={15} /></span><span><b>Accessible spaces</b><small>{accessibleSecs ? `${accessibleSecs} places in accessible sections.` : "Wheelchair and step-free places."}</small></span><span className="tp-in xs"><input inputMode="numeric" aria-label="Accessible spaces" value={a.accessible_seats || accessibleSecs} onChange={x => set({ accessible_seats: Number(x.target.value.replace(/\D/g, "")) || 0 })} /></span></div>
        <div className="tp-opt"><span className="tp-oi"><Users size={15} /></span><span><b>Free companion tickets</b><small>One free companion with each accessible ticket.</small></span><Toggle checked={a.companion} onChange={v => set({ companion: v })} label="Free companion tickets" /></div>
        <div className="tp-disp"><b>Ticket display</b><small>How the ticket appears in the buyer&apos;s wallet. Every view is the same rotating, signed credential.</small>
          <div className="tp-seg3" role="radiogroup" aria-label="Ticket display">{([["qr", "QR code"], ["visual", "Ticket"], ["barcode", "Barcode"]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={a.ticket_display === k} data-on={a.ticket_display === k || undefined} onClick={() => set({ ticket_display: k })}>{l}</button>)}</div>
          <div className="tp-qr"><Toggle checked={a.ticket_display_switch} onChange={v => set({ ticket_display_switch: v })} label="Let buyers switch view" /><span>Let buyers switch between views</span></div></div>
        {holdSecs > 0 && <p className="tp-note"><Info size={13} />{holdSecs} places are held in “Comps &amp; Holds” sections. Comps above that come out of general inventory.</p>}
      </Card>
    </div>
    <div className="tp-g3b">
      <Card title="Buyer questions" sub="Collect additional information at checkout (optional).">
        <ul className="tp-qs">{a.questions.map((q, i) => <li key={q.key}><GripVertical size={13} className="tp-grip" /><input type="checkbox" checked={q.on} disabled={["full_name", "email"].includes(q.key)} aria-label={`Ask ${q.label}`} onChange={x => set({ questions: a.questions.map((y, k) => k === i ? { ...y, on: x.target.checked } : y) })} />
          {q.custom ? <input className="tp-bare" aria-label="Question" value={q.label} maxLength={80} onChange={x => set({ questions: a.questions.map((y, k) => k === i ? { ...y, label: x.target.value } : y) })} /> : <span>{q.label}{["full_name", "email"].includes(q.key) && <small> (required)</small>}</span>}
          {["full_name", "email"].includes(q.key) ? <em className="tp-req">Required</em> : q.key === "dob" && !q.on ? <em className="tp-rec">Recommended</em> : q.on ? <button className={`tp-reqt ${q.required ? "on" : ""}`} onClick={() => set({ questions: a.questions.map((y, k) => k === i ? { ...y, required: !y.required } : y) })}>{q.required ? "Required" : "Optional"}</button> : null}
          {q.custom && <button className="k-icon-btn" aria-label={`Remove ${q.label}`} onClick={() => set({ questions: a.questions.filter((_, k) => k !== i) })}><X size={12} /></button>}</li>)}</ul>
        <button className="k-btn outline sm" disabled={a.questions.length >= 15} onClick={() => set({ questions: [...a.questions, { key: `custom_${uid()}`, label: "Custom question", on: true, required: false, custom: true }] })}><Plus size={13} />Add custom question</button>
      </Card>
      <Card title="Fees and pricing display" sub="Choose how fees are shown to buyers.">
        <div className="tp-radios">{([["upfront", "Show all fees upfront", "Transparent pricing (recommended)."], ["included", "Include fees in ticket price", "Ticket price includes all fees."], ["checkout", "Show base price, fees at checkout", "Display fees later in the checkout process."]] as const).map(([k, t, d]) => <button key={k} role="radio" aria-checked={a.fee_display === k} data-on={a.fee_display === k || undefined} onClick={() => set({ fee_display: k })}><i /><span><b>{t}</b><small>{d}</small></span></button>)}</div>
        <dl className="tp-fee"><dt className="h">Example ({ex?.name ?? "ticket"})</dt><dd /><dt>Ticket price</dt><dd>{gbp2(f.price)}</dd>{a.fee_display !== "included" && <><dt>Service fee (5%)</dt><dd>{gbp2(f.service)}</dd><dt>Payment fee (2.9% + £0.30)</dt><dd>{gbp2(f.processing)}</dd></>}<dt className="t">Total (to buyer)</dt><dd className="t">{gbp2(f.total)}</dd></dl>
      </Card>
      <Card title="Payout & verification" sub="Set up how you receive funds from ticket sales.">
        {data.payoutReady ? <div className="tp-ok"><CheckCircle2 size={20} /><span><b>Connected account verified</b><small>Your Stripe account is verified and ready to receive payouts.</small></span></div>
          : <div className="tp-warn"><AlertTriangle size={20} /><span><b>Payouts not set up</b><small>Paid tickets can&apos;t go on sale until payouts are verified.</small></span></div>}
        <div className="tp-g2f"><label className="tp-f"><span>Payout currency</span><span className="tp-in ro">GBP (£)</span></label><label className="tp-f"><span>Payout schedule</span><span className="tp-in ro">7 days after event</span></label></div>
        <label className="tp-f"><span>Bank account</span><span className="tp-in ro"><Landmark size={14} />{data.payoutLabel ?? (data.payoutReady ? "Connected via Stripe" : "Not connected")}<Link className="k-link tp-chg" href="/organizer/money?tab=payouts">{data.payoutReady ? "Change" : "Set up"}</Link></span></label>
        <p className="tp-note">Ticket revenue (minus platform fees) will be paid to your verified Stripe account according to your payout schedule.</p>
      </Card>
    </div>
    <Card title="Terms and disclosures" sub="Set the ticket terms and important information for buyers." className="tp-terms">
      <div className="tp-g2t"><div>
        <label className="tp-f"><span>Ticket terms template</span><span className="k-row" style={{ gap: 8 }}><span className="tp-in sel k-grow"><select value={a.terms_template} onChange={x => set({ terms_template: x.target.value })}>{TERMS_TEMPLATES.map(t => <option key={t}>{t}</option>)}</select><ChevronDown size={13} /></span><Link className="k-btn outline sm" href="/help?topic=ticketing-terms" target="_blank"><Pencil size={13} />View</Link></span></label>
        <label className="tp-cb"><input type="checkbox" checked={a.require_terms} onChange={x => set({ require_terms: x.target.checked })} />Require buyers to agree to terms</label>
        <div className="tp-agerow"><label className="tp-cb"><input type="checkbox" checked={a.age_message} onChange={x => set({ age_message: x.target.checked })} />Show age restriction message</label><span className="tp-in"><input aria-label="Age restriction message" maxLength={120} placeholder="18+ only" disabled={!a.age_message} value={a.age_text} onChange={x => set({ age_text: x.target.value })} /></span></div>
        {a.age_message && <small className="tp-hint">This event is {a.age_text || "age restricted"}. Valid ID may be required on entry.</small>}</div>
        <label className="tp-f"><span>Important event information</span><div className="tp-rte"><textarea maxLength={2000} placeholder="Please arrive early, bring valid ID and check the event FAQ for full details on entry, security and accessibility." value={a.info_text} onChange={x => set({ info_text: x.target.value })} /><small>{a.info_text.length}/2000</small></div></label></div>
    </Card>
    <Footer backHref={`${base}?step=3`} pending={pending} onDraft={() => void save(false)} onNext={() => void save(true)} />
  </>;
}
