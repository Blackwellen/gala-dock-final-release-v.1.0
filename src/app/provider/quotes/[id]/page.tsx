import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send, PenSquare, CircleX, CalendarCheck, Copy, FileText, CalendarDays, Clock4, MapPin, Users, ArrowRight, ChevronRight, PartyPopper,
  MessageSquare, Printer, ShieldCheck, Sparkles, CircleCheck, CircleAlert, ScrollText, Ban, Info } from "lucide-react";
import "@/styles/provider-quote-profile.css";
import { Chip, Avatar, Thumb, Tabs } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { money, day, time, relative, titleCase, requestTime } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceItems, workspaceListings, workspaceSpaces } from "@/lib/provider/queries";
import { workspaceQuotes } from "@/lib/provider/commercial";
import { sendDraftQuote, withdrawQuote } from "../actions";
import { CopyLink } from "./copy-link";

export const metadata: Metadata = { title: "Quote" };
const statusLook: Record<string, { label: string; tone: "blue" | "purple" | "grey" | "green" | "red" | "amber" }> = {
  draft: { label: "Draft — not sent", tone: "amber" }, sent: { label: "Sent to client", tone: "blue" }, viewed: { label: "Viewed by client", tone: "purple" },
  accepted: { label: "Accepted", tone: "green" }, declined: { label: "Declined by client", tone: "red" }, withdrawn: { label: "Withdrawn", tone: "grey" },
  expired: { label: "Expired", tone: "grey" }, superseded: { label: "Superseded by a newer version", tone: "grey" },
};
const fmt = (iso?: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

export default async function QuoteProfile(props: PageProps<"/provider/quotes/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab = (["quote", "terms", "activity"].includes(String(sp.tab)) ? sp.tab : "quote") as "quote" | "terms" | "activity";
  const [ctx, quotes, items, listings, spaces] = await Promise.all([getProvider(), workspaceQuotes(), workspaceItems(), workspaceListings(), workspaceSpaces()]);
  const q = quotes.find(x => x.id === id);
  if (!q) notFound();
  const item = items.find(i => i.id === q.build_item_id);
  const e = item?.event, r = item?.request;
  const listing = listings.find(l => l.id === item?.listing_id);
  const space = spaces.find(s => s.id === (r?.requirements?.space_id as string | undefined));
  const versions = quotes.filter(x => x.build_item_id === q.build_item_id).sort((a, b) => b.version - a.version);
  const now = requestTime();
  const look = statusLook[q.status] ?? { label: titleCase(q.status), tone: "grey" as const };
  const terms = q.terms as { cancellation?: { window: string; refund: number }[]; inclusions?: string[]; exclusions?: string[]; hold_offer?: boolean; hold_hours?: number; standby?: boolean; additional_notes?: string; tax_bps?: number; valid_days?: number; discount?: number };
  const main = q.items.filter(i => !["travel", "setup", "other"].includes(i.kind));
  const extras = q.items.filter(i => ["travel", "setup", "other"].includes(i.kind));
  const subtotal = main.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const extrasTotal = extras.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const deposit = Math.round(Number(q.total) * q.deposit_pct) / 100;
  // Rate as recorded on the quote; older versions without it are derived from their stored amounts.
  const taxRate = terms.tax_bps ? terms.tax_bps / 100 : Number(q.subtotal) ? Math.round((Number(q.tax) / Number(q.subtotal)) * 1000) / 10 : 0;
  const validDays = q.valid_until ? Math.ceil((new Date(q.valid_until).getTime() - now) / 864e5) : null;
  const open = ["draft", "sent", "viewed"].includes(q.status);
  const [audit, thread] = await Promise.all([
    rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string }>(ctx.db.from("audit_events").select("id,event,metadata,created_at").eq("workspace_id", ctx.workspace.id).contains("metadata", { build_item_id: q.build_item_id }).order("created_at", { ascending: false })),
    rows<{ id: string }>(ctx.db.from("threads").select("id").eq("build_item_id", q.build_item_id).limit(1)),
  ]);
  // Suggestions derived from the quote and the request (no invented market data).
  const tips = [
    r?.budget_max ? (Number(q.total) <= Number(r.budget_max) ? { ok: true, title: "Within the client’s budget", text: `Total ${money(q.total)} vs disclosed ${money(r.budget_min ?? 0)} – ${money(r.budget_max)}.` }
      : { ok: false, title: "Above the client’s budget", text: `Total ${money(q.total)} exceeds the disclosed maximum of ${money(r.budget_max)}.` }) : null,
    validDays !== null && validDays <= 3 && open ? { ok: false, title: "Quote expiring soon", text: `Valid for ${Math.max(0, validDays)} more day${validDays === 1 ? "" : "s"}. Consider extending it in a revision.` } : null,
    !terms.cancellation?.length ? { ok: false, title: "Add a cancellation policy", text: "Clients compare refund terms before accepting." } : { ok: true, title: "Cancellation terms included", text: `${terms.cancellation.length} refund tiers are shown to the client.` },
    { ok: !extras.length || extrasTotal < Number(q.total) * 0.2, title: "Additional costs", text: extras.length ? `${money(extrasTotal)} of extras are itemised separately.` : "No travel or setup costs added." },
  ].filter(Boolean) as { ok: boolean; title: string; text: string }[];

  return <div className="qp">
    <Link href={item ? `/provider/opportunities/${item.id}` : "/provider/opportunities"} className="ws-back qp-back"><ArrowLeft aria-hidden="true" />Back to Opportunity</Link>
    <header className="qp-head">
      <div><h1>Quote for {e?.name ?? "event"}</h1>
        <p className="qp-sub"><Chip tone="blue">Revision {q.version}</Chip><span>{q.reference}</span>{r?.reference && <span>Linked to request #{r.reference}</span>}</p></div>
      <div className={`qp-status ${look.tone}`}><Clock4 aria-hidden="true" /><span><b>{look.label}</b><small>{q.sent_at ? `Sent ${fmt(q.sent_at)}` : `Created ${fmt(q.created_at)}`}</small></span></div>
      <div className="qp-actions">
        <CopyLink />
        <Link href={`/provider/quotes/${q.id}/print`} className="ws-btn outline" target="_blank"><Printer aria-hidden="true" />Print / PDF</Link>
        {item && <Link href={`/provider/opportunities/${item.id}/quote?step=1${q.status === "draft" ? `&quote=${q.id}` : `&from=${q.id}`}`} className="ws-btn primary"><PenSquare aria-hidden="true" />{q.status === "draft" ? "Edit draft" : "Revise Quote"}</Link>}
      </div>
    </header>
    <Tabs base={`/provider/quotes/${q.id}`} active={tab} tabs={[{ key: "quote", label: "Quote" }, { key: "terms", label: "Terms" }, { key: "activity", label: "Activity" }]} />

    <section className="qp-cards">
      <div className="ws-panel qp-event"><Thumb src={e?.cover_image || item?.image} w={110} h={100} /><div><b>{e?.name}</b>
        <small><CalendarDays aria-hidden="true" />{day(e?.starts_at)}</small><small><Clock4 aria-hidden="true" />{time(e?.starts_at)} – {time(e?.ends_at)}</small>
        <small><MapPin aria-hidden="true" />{e?.location}</small><small><Users aria-hidden="true" />{e?.guest_count} guests</small></div></div>
      <div className="ws-panel qp-client"><small className="qp-label">Client / Organiser</small>
        <div className="qp-client-row"><Avatar name={e?.client_name ?? "Client"} size={40} /><span><b>{e?.client_name}</b><small>{String(e?.settings?.requester_org ?? "Client")}</small></span></div>
        <div className="qp-client-actions">{thread[0] ? <Link className="ws-btn outline sm" href={`/provider/messages/${thread[0].id}`}><MessageSquare aria-hidden="true" />Message</Link>
          : <span className="ws-btn outline sm" aria-disabled="true" title="No conversation has been opened for this request yet"><MessageSquare aria-hidden="true" />Message</span>}</div></div>
      <div className="ws-panel qp-opp"><div className="qp-opp-head"><FileText aria-hidden="true" /><b>Opportunity</b>{r?.reference && <Chip tone="blue">{r.reference}</Chip>}</div>
        <small>Received {relative(item?.created_at, now)}</small>{item && <Link className="ws-link" href={`/provider/opportunities/${item.id}`}>View opportunity <ArrowRight aria-hidden="true" /></Link>}</div>
      <div className="ws-panel qp-type"><small className="qp-label">Event type</small><div><PartyPopper aria-hidden="true" /><span><b>{titleCase(e?.event_type ?? "Event")}</b><small>{r?.scope?.split(". ")[0]}</small></span><ChevronRight aria-hidden="true" /></div></div>
    </section>

    <div className="qp-body">
      <div className="qp-main">
        {tab === "quote" && <>
          <section className="ws-panel qp-items"><div className="qp-items-head"><h2><FileText aria-hidden="true" />Quote items</h2>
            {item && open && <Link className="ws-btn outline sm" href={`/provider/opportunities/${item.id}/quote?step=1${q.status === "draft" ? `&quote=${q.id}` : `&from=${q.id}`}`}>{q.status === "draft" ? "Edit items" : "Revise items"}</Link>}</div>
            <div className="ws-table-scroll"><table className="ws-table qp-table"><thead><tr><th>Item</th><th>Details</th><th>Date / Time</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead>
              <tbody>{q.items.map((i, n) => <tr key={n}><td><div className="ws-cell">{i.image ? <Thumb src={i.image} w={44} h={40} /> : <span className="qp-noimg" />}<div className="ws-cell-text"><b>{i.label}</b><small>{titleCase(i.kind)}</small></div></div></td>
                <td className="qp-detail">{i.detail || "—"}</td><td><div className="ws-cell-text"><b className="qp-light">{day(e?.starts_at, { day: "numeric", month: "short", year: "numeric" })}</b><small>{["travel", "setup", "other"].includes(i.kind) ? "As required" : `${time(e?.starts_at)} – ${time(e?.ends_at)}`}</small></div></td>
                <td className="ws-num">{i.qty}</td><td className="ws-num">{money(i.unit_price, "GBP", { cents: i.unit_price % 1 !== 0 })}</td><td className="ws-num"><b>{money(i.qty * i.unit_price, "GBP", { cents: (i.qty * i.unit_price) % 1 !== 0 })}</b></td></tr>)}</tbody></table></div>
          </section>
          <div className="qp-money">
            <section className="ws-panel qp-fin"><h2>Financial summary</h2><dl>
              <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
              <div><dt>Travel &amp; expenses</dt><dd>{money(extrasTotal)}</dd></div>
              <div><dt>Discount</dt><dd>{terms.discount ? `−${money(terms.discount)}` : "—"}</dd></div>
              <div><dt>{Number(q.tax) > 0 ? `VAT (${taxRate}%)` : "Tax"}</dt><dd>{Number(q.tax) > 0 ? money(q.tax, "GBP", { cents: true }) : "Not charged"}</dd></div>
              <div className="total"><dt>Total (GBP)</dt><dd>{money(q.total, "GBP", { cents: Number(q.total) % 1 !== 0 })}</dd></div></dl></section>
            <section className="ws-panel qp-schedule"><h2>Payment schedule</h2>
              <ul><li><i className="orange" /><span>Deposit ({q.deposit_pct}%)</span><b>{money(deposit)}</b><small>Due on acceptance</small></li>
                <li><i className="green" /><span>Balance ({100 - q.deposit_pct}%)</span><b>{money(Number(q.total) - deposit)}</b><small>Due 14 days before the event</small></li></ul>
              <p className="qp-note"><Info aria-hidden="true" />Payments are collected through Gala Dock checkout once the client accepts. Nothing is charged by sending a quote.</p></section>
          </div>
        </>}
        {tab === "terms" && <section className="ws-panel qp-terms-tab">
          <div className="qp-terms-grid">
            <div><h3><CircleCheck aria-hidden="true" className="ok" />Included</h3><ul>{(terms.inclusions ?? main.map(i => i.label)).map(t => <li key={t}>{t}</li>)}</ul></div>
            <div><h3><Ban aria-hidden="true" className="no" />Excluded</h3><ul>{(terms.exclusions ?? []).length ? terms.exclusions!.map(t => <li key={t}>{t}</li>) : <li className="ws-muted">No exclusions listed</li>}</ul></div>
            <div><h3><ScrollText aria-hidden="true" />Cancellation policy</h3><table className="qp-policy"><tbody>{(terms.cancellation ?? []).map(t => <tr key={t.window}><td>{t.window} before event</td><td>{t.refund ? `${t.refund}% refund` : "No refund"}</td></tr>)}</tbody></table></div>
          </div>
          {terms.additional_notes && <p className="qp-notes"><b>Notes:</b> {terms.additional_notes}</p>}
          <h3 className="qp-msg-h">Message to client</h3><blockquote className="qp-msg">{q.message || "No message."}</blockquote>
        </section>}
        {tab === "activity" && <section className="ws-panel qp-terms-tab"><h2>Activity</h2>
          <ol className="pq-timeline qp-timeline">{[
            ...versions.map(v => ({ at: v.sent_at ?? v.created_at, text: `${v.reference} v${v.version} ${v.status === "draft" ? "drafted" : v.status === "superseded" ? "sent (later superseded)" : v.status} — ${money(v.total)}` })),
            ...audit.filter(a => a.event.startsWith("request.")).map(a => ({ at: a.created_at, text: `Response: ${titleCase(String(a.metadata.response ?? a.event))}` })),
            ...(item ? [{ at: item.created_at, text: `Request received from ${e?.client_name}` }] : []),
          ].sort((a, b) => b.at.localeCompare(a.at)).map((x, i) => <li key={i}><time>{fmt(x.at)}</time><span>{x.text}</span></li>)}</ol></section>}
      </div>

      <aside className="qp-rail">
        <section className="ws-panel qp-preview"><div className="qp-preview-head"><h2>Quote preview</h2><Link className="ws-link" href={`/provider/quotes/${q.id}/print`} target="_blank">Preview as PDF</Link></div>
          <div className="qp-hero" style={{ backgroundImage: `url(${listing?.image || e?.cover_image || ""})` }}><span><b>{ctx.workspace.name}</b><small>{listing?.location}</small></span></div>
          <b className="qp-pv-title">{e?.name}</b><p className="qp-pv-meta"><span><CalendarDays aria-hidden="true" />{day(e?.starts_at, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span><span><Clock4 aria-hidden="true" />{time(e?.starts_at)} – {time(e?.ends_at)}</span></p>
          <p className="qp-pv-meta"><span><Users aria-hidden="true" />{e?.guest_count} guests{space ? ` · ${space.name}` : ""}</span></p>
          <p className="qp-pv-msg">{q.message.split("\n").filter(Boolean).slice(1, 2).join(" ") || q.message.slice(0, 180)}</p></section>
        <section className="ws-panel qp-actions-card"><h2>Quote actions</h2><ul>
          {q.status === "draft" && <li><ActionButton action={sendDraftQuote} args={[q.id]} variant="ghost" className="qp-act" confirm={{ title: "Send this quote?", body: `The client will receive ${q.reference} v${q.version} for ${money(q.total)}. Earlier versions will be superseded.`, cta: "Send quote" }}><Send aria-hidden="true" /><span><b>Send to client</b><small>Issue this draft as version {q.version}</small></span></ActionButton></li>}
          {item && <li><Link className="qp-act" href={`/provider/opportunities/${item.id}/quote?step=1${q.status === "draft" ? `&quote=${q.id}` : `&from=${q.id}`}`}><PenSquare aria-hidden="true" /><span><b>Revise quote</b><small>{q.status === "draft" ? "Continue editing this draft" : "Create a new revision"}</small></span></Link></li>}
          {open && <li><ActionButton action={withdrawQuote} args={[q.id]} variant="ghost" className="qp-act danger" confirm={{ title: "Withdraw this quote?", body: "The client will no longer be able to accept it. The request stays open so you can send a new quote.", cta: "Withdraw quote" }}><CircleX aria-hidden="true" /><span><b>Withdraw quote</b><small>Cancel this quote</small></span></ActionButton></li>}
          <li><span className="qp-act disabled" title="A booking is created automatically when the client accepts and pays the deposit"><CalendarCheck aria-hidden="true" /><span><b>Convert to booking</b><small>Happens when the client accepts</small></span></span></li>
          {item && <li><Link className="qp-act" href={`/provider/opportunities/${item.id}/quote?step=1&from=${q.id}`}><Copy aria-hidden="true" /><span><b>Duplicate quote</b><small>Use as a starting point</small></span></Link></li>}
        </ul></section>
        <section className="ws-panel qp-validity"><h2>Validity &amp; options</h2>
          <p className="qp-valid"><CalendarDays aria-hidden="true" />Valid until <b>{q.valid_until ? day(q.valid_until, { day: "numeric", month: "short", year: "numeric" }) : "—"}</b>{validDays !== null && <span>({validDays > 0 ? `${validDays} days` : "expired"})</span>}</p>
          <p className="qp-opt"><ShieldCheck aria-hidden="true" /><span><b>Conditional hold option</b><small>{terms.hold_offer ? `Offered for ${terms.hold_hours ?? 24} hours` : "Not offered"}</small></span><Chip tone={terms.hold_offer ? "green" : "grey"}>{terms.hold_offer ? "On" : "Off"}</Chip></p>
          <p className="qp-opt"><ShieldCheck aria-hidden="true" /><span><b>Standby offer option</b><small>Be considered as backup provider</small></span><Chip tone={terms.standby ? "green" : "grey"}>{terms.standby ? "On" : "Off"}</Chip></p></section>
        <section className="ws-panel qp-agent"><h2><Sparkles aria-hidden="true" />Gala Agent</h2><p className="ws-muted">Checks on this quote:</p>
          <ul>{tips.map(t => <li key={t.title}>{t.ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span><b>{t.title}</b><small>{t.text}</small></span></li>)}</ul></section>
      </aside>
    </div>
    {tab === "quote" && <section className="ws-panel qp-strip" aria-label="Terms & policies">
      <div className="qp-strip-h"><ScrollText aria-hidden="true" /><span><b>Terms &amp; policies</b><Link className="ws-btn outline sm" href={`/provider/quotes/${q.id}?tab=terms`}>View terms</Link></span></div>
      <div><CalendarDays aria-hidden="true" /><span><b>Cancellation policy</b><small>{(terms.cancellation ?? []).map(t => `${t.window}: ${t.refund ? `${t.refund}% refund` : "no refund"}`).join(". ") || "Platform default applies."}</small></span></div>
      <div><PenSquare aria-hidden="true" /><span><b>Changes &amp; amendments</b><small>Date or guest-number changes are subject to availability and may change the price.</small></span></div>
      <div className="ok"><CircleCheck aria-hidden="true" /><span><b>Included in price</b><small>{(terms.inclusions ?? main.map(i => i.label)).slice(0, 4).join(", ")}.</small></span></div>
      <div className="no"><Ban aria-hidden="true" /><span><b>Exclusions</b><small>{(terms.exclusions ?? []).join(", ") || "None listed."}</small></span></div>
    </section>}
    <footer className="qp-foot">Created: {fmt(q.created_at)} <span>|</span> Version: {q.version} <span>|</span> {versions.length} version{versions.length === 1 ? "" : "s"} for this request <span>|</span> Status: {look.label}</footer>
  </div>;
}
