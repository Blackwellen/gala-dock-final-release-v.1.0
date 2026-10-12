"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, AlertCircle, ExternalLink, CalendarDays, MapPin, Users, Sparkles, ArrowRight, ArrowLeft, Loader2, Pencil, Smartphone } from "lucide-react";
import { useAction } from "@/components/kit/client";
import { activateTickets } from "@/lib/actions/ticket-pro";
import { TIER_KINDS, SECTION_TYPES, TERMS_TEMPLATES, feeExample } from "@/lib/ticket-pro-model";
import type { ProSetup } from "@/lib/data/ticket-pro";
import { Card, gbp, gbp2, num, pct, dt } from "./ui";

const TZ = "Europe/London";
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : "Date TBC";
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";

export function StepReview({ data, base }: { data: ProSetup; base: string }) {
  const { run, pending } = useAction(); const e = data.event; const p = data.pro; const a = p.access;
  const [tab, setTab] = useState<"page" | "tickets" | "flow" | "mobile">("page"); const [agree, setAgree] = useState(false); const [now] = useState(() => Date.now());
  const active = data.tiers.filter(t => !["hidden", "paused"].includes(t.status)); const total = active.reduce((n, t) => n + t.quantity, 0);
  const sellable = Math.floor(p.capacity * (1 - p.buffer_pct / 100)); const revenue = active.reduce((n, t) => n + t.price * t.quantity, 0);
  const paid = active.some(t => t.price > 0); const from = active.filter(t => t.price > 0).sort((x, y) => x.price - y.price)[0];
  const pagePublished = !!e.slug && e.visibility === "public" && ["published", "on_sale", "sold_out"].includes(e.status);
  const checks: [string, string, boolean, number | string, boolean][] = [
    ["Event details complete", "Title, description, date and location.", !!e.starts_at && Date.parse(e.starts_at) > now && e.description.trim().length >= 20 && !!(e.venue_name || e.location), `/organizer/events/${e.id}`, true],
    ["Ticket inventory configured", `${num(total)} tickets across ${active.length} tier${active.length === 1 ? "" : "s"}.`, data.saved.tiers && active.length > 0 && total <= sellable && active.every(t => t.sale_start || t.after_tier), 2, true],
    ["Payment account verified", paid ? (data.payoutReady ? "Stripe account connected." : "Connect Stripe to sell paid tickets.") : "Free tickets — no payouts needed.", !paid || data.payoutReady, "/organizer/money?tab=payouts", true],
    ["Refund and transfer rules set", "Policies configured.", data.saved.access, 4, true],
    ["Terms and buyer information", `${a.questions.filter(q => q.on).length} checkout questions · ${a.require_terms ? "terms required" : "terms optional"}.`, data.saved.access && a.questions.some(q => q.key === "email" && q.on), 4, true],
    ["Event page published", pagePublished ? "Event page is public and optimised." : "Your page goes live when tickets activate.", pagePublished, `/organizer/events/${e.id}/page`, false],
  ];
  const blocking = checks.filter(c => c[4] && !c[2]); const ready = !blocking.length;
  const editHref = (h: number | string) => typeof h === "number" ? h === 4 ? `${base}?step=3&section=policies` : h === 3 ? `${base}?step=1&section=seating` : `${base}?step=${h}` : h;
  const fee = feeExample(from?.price ?? 0, a.fee_display);

  return <>
    <div className="tp-g2r">
      <div className="tp-col">
        <Card title="Model & capacity" action={<Link className="k-btn outline sm" href={`${base}?step=1`}><Pencil size={13} />Edit</Link>}>
          <div className="tp-kp4 in">{([["Ticketing model", { general: "General Admission", reserved: "Reserved Seating", hybrid: "Hybrid" }[p.model]], ["Event capacity", num(p.capacity)], ["Safety buffer", `${p.buffer_pct}% (${num(p.capacity - sellable)})`], ["Sections", `${p.sections.length}`]] as const).map(([l, v]) => <div key={l} className="tp-kp"><small>{l}</small><b>{v}</b></div>)}</div>
          {p.sections.length > 0 && <ul className="tp-secl">{p.sections.map(s => <li key={s.id}><i style={{ background: s.color }} />{s.name}<small>{SECTION_TYPES[s.type]} · {num(s.capacity)}{s.holds ? ` · ${num(s.holds)} held` : ""}</small></li>)}</ul>}
        </Card>
        <Card title="Ticket tiers" sub={`${num(total)} tickets · projected ${gbp(Math.round(revenue))}`} action={<Link className="k-btn outline sm" href={`${base}?step=2`}><Pencil size={13} />Edit</Link>}>
          <div className="tp-tw" tabIndex={0} role="region" aria-label="Ticket tier summary; scroll to view all columns"><table className="tp-t"><thead><tr><th>Tier</th><th>Type</th><th>Price</th><th>Quantity</th><th>Sales window</th><th>Sections</th></tr></thead>
            <tbody>{data.tiers.map(t => <tr key={t.id} data-off={["hidden", "paused"].includes(t.status) || undefined}><td><span className="tp-sn2"><i style={{ background: t.color }} />{t.name}</span></td><td>{TIER_KINDS[t.kind] ?? t.kind}</td><td>{gbp2(t.price)}</td><td>{num(t.quantity)}</td>
              <td>{t.after_tier ? `After ${data.tiers.find(x => x.id === t.after_tier)?.name ?? "previous tier"} sells out` : `${dt(t.sale_start)} → ${dt(t.sale_end)}`}{t.release_name && <small className="tp-ph"> · {t.release_name.split(" – ")[0]}</small>}{(t.valid_from || t.valid_to) && <small className="tp-sess">Entry {dt(t.valid_from)} → {dt(t.valid_to)}</small>}</td><td className="k-muted">{["hidden", "paused"].includes(t.status) ? "Hidden" : t.allocation ?? "General"}</td></tr>)}</tbody></table></div>
        </Card>
        <Card title="Access & controls" action={<Link className="k-btn outline sm" href={`${base}?step=3&section=policies`}><Pencil size={13} />Edit</Link>}>
          <dl className="tp-dl">{([["Transfers", a.transfers ? "Allowed" : "Not allowed"], ["Resale", a.resale ? `Official marketplace · ${a.resale_cap === 100 ? "face value" : `up to ${a.resale_cap}%`}` : "Not allowed"], ["Refunds", { none: "No refunds", date: `${a.refund_amount}% until ${dt(a.refund_cutoff)}`, flexible: "Up to 24 hours before", cancel: "Only if cancelled" }[a.refund]], ["Fees", { upfront: "Shown upfront", included: "Included in price", checkout: "Shown at checkout" }[a.fee_display]], ["Order limit", `${p.sales.order_limit} per order`], ["Terms", `${TERMS_TEMPLATES.includes(a.terms_template as typeof TERMS_TEMPLATES[number]) ? a.terms_template : "Custom"}${a.require_terms ? " · required" : ""}`], ["Comps", num(a.comps)], ["Discount codes", `${data.promos.length}`]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </Card>
      </div>
      <div className="tp-col">
        <Card title="Event preview" className="tp-prev" action={e.slug ? <Link className="k-btn outline sm" href={`/events/${e.slug}${pagePublished ? "" : "?preview=1"}`} target="_blank"><ExternalLink size={13} />Open in new tab</Link> : undefined}>
          {tab !== "mobile" && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img className="tp-pimg" src={e.cover} alt="" /></>}
          {tab === "page" && <><h3>{e.name}</h3><p className="tp-pd">{e.description.slice(0, 90)}{e.description.length > 90 ? "…" : ""}</p><div className="tp-pfacts"><span><CalendarDays size={15} /><span><b>{day(e.starts_at)}</b><small>{time(e.starts_at)}{e.ends_at ? ` – ${time(e.ends_at)}` : ""}</small></span></span><span><MapPin size={15} /><span><b>{e.venue_name || "Venue TBC"}</b><small>{e.location.split(",").slice(-2).join(",").trim()}</small></span></span><span><Users size={15} /><span><b>{num(p.capacity)}</b><small>Capacity</small></span></span></div></>}
          {tab === "tickets" && <ul className="tp-buy">{active.map(t => <li key={t.id}><i style={{ background: t.color }} /><span className="k-grow"><b>{t.name}</b><small>{t.description}</small></span><b>{t.price ? gbp2(a.fee_display === "included" ? feeExample(t.price, "included").total : t.price) : "Free"}</b></li>)}</ul>}
          {tab === "flow" && <ol className="tp-flow"><li><b>Choose tickets</b><small>Up to {p.sales.order_limit} per order{p.sales.show_remaining ? " · live availability shown" : ""}</small></li><li><b>Buyer details</b><small>{a.questions.filter(q => q.on).map(q => q.label).join(", ")}</small></li><li><b>Payment</b><small>{from ? `e.g. ${from.name}: ${gbp2(fee.total)} total` : "No payment for free tickets"}</small></li><li><b>Confirmation</b><small>QR ticket by email{a.transfers ? " · transferable" : ""}</small></li></ol>}
          {tab === "mobile" && <div className="tp-phone"><Smartphone size={14} className="tp-pi" />{/* eslint-disable-next-line @next/next/no-img-element */}<img src={e.cover} alt="" /><b>{e.name}</b><small>{day(e.starts_at)}</small>{from && <span>From {gbp2(from.price)}</span>}<em>Get tickets</em></div>}
          <div className="tp-ptabs" role="tablist">{([["page", "Event page"], ["tickets", "Ticket selection"], ["flow", "Buyer flow"], ["mobile", "Mobile view"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
        </Card>
        <Card className="tp-ready" title={<><Sparkles size={17} className="tp-spark" />Gala Agent readiness checklist <span className="k-beta">BETA</span></>} sub={ready ? "Everything looks good! Your event is ready to publish." : `${blocking.length} item${blocking.length > 1 ? "s" : ""} to finish before you can activate.`}>
          <ul>{checks.map(([t, d, ok, href, req]) => <li key={t}>{ok ? <CheckCircle2 size={18} className="ok" /> : <AlertCircle size={18} className={req ? "bad" : "warn"} />}<span className="k-grow"><b>{t}</b><small>{d}</small></span><Link className="k-btn outline sm" href={editHref(href)}>Edit</Link></li>)}</ul>
        </Card>
        <section className={`tp-go ${ready ? "" : "off"}`}>
          <div className="tp-goh">{ready ? <CheckCircle2 size={26} /> : <AlertCircle size={26} />}<span><b>{ready ? "Ready to publish" : "Almost there"}</b><small>{ready ? "All checks passed. You can now activate ticket sales for this event." : "Finish the checklist above to activate sales."}</small></span></div>
          <label className="tp-cb"><input type="checkbox" checked={agree} onChange={x => setAgree(x.target.checked)} />I agree to the Gala Dock <Link className="k-link" href="/help?topic=ticketing-terms" target="_blank">ticketing terms</Link></label>
          <button className="k-btn primary tp-pub" disabled={pending || !ready || !agree} onClick={() => void run(() => activateTickets(e.id, agree))}>{pending && <Loader2 size={16} className="k-spin" />}{data.live ? "Update ticket sales" : "Publish tickets"}<ArrowRight size={17} /></button>
          <small>Your event will be visible in search, on your event page and available for promotion. {paid && `Tickets from ${gbp2(from!.price)}.`} {pct(total, p.capacity, 0)} of capacity on sale.</small>
        </section>
        <Link className="k-btn outline tp-back" href={`${base}?step=3&section=policies`}><ArrowLeft size={16} />Back</Link>
      </div>
    </div>
  </>;
}
