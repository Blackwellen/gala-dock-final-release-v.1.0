import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, CheckCircle2, XCircle, CalendarClock, Diamond, ShieldCheck, Check, FileText, Repeat, Lock, CircleHelp, ChevronRight, CreditCard } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { eventTypeLabel } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResaleReview } from "./review";
import "@/styles/cu-resale.css";

export const metadata = { title: "Official resale" };

type Ev = { id: string; name: string; starts_at: string | null; ends_at: string | null; status: string; currency: string | null; settings: Record<string, unknown>; cover_image: string | null; location: string | null; event_type: string | null };
type Policy = { jurisdiction: string; version: number; price_cap_pct: number; listing_cutoff_hours: number; max_active_listings_per_user: number | null; legal_review_status: string };
type Restr = { transfer_allowed?: boolean; min_age?: number; name_on_ticket?: boolean; terms_url?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (s: string | null, e: string | null) => {
  if (!s) return "Date to be announced";
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", ...o });
  return `${f(s, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}, ${f(s, { hour: "2-digit", minute: "2-digit" })}${e ? ` – ${f(e, { hour: "2-digit", minute: "2-digit" })}` : ""}`;
};

/**
 * Official resale, CU (BUY-W02) — laid out to the "Ticket Resale Dashboard" / "Ticket Resale Review" references.
 * Settlement is organiser buy-back (Q22): the listing price is the price paid and the seller is refunded to the original payment
 * method, so the reference's free price entry and bank/Stripe payout choice are shown as fixed facts, not inputs.
 * The reference's Gala Agent panel is a static, non-AI "Resale help" FAQ (owner decision: no AI in the customer workspace).
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params, sp = await searchParams;
  const step = sp.step === "2" ? 2 : 1;
  const ctx = await getCustomer(`/account/tickets/${id}/resale?step=${step}`);
  if (!UUID.test(id)) notFound();
  const db = untyped(ctx.supabase);
  const { data: t, error } = await db.from("tickets").select("id,event_id,status,order_ref,price_paid,checked_in_at,seat,tier:ticket_tiers(name,price),event:events!inner(id,name,starts_at,ends_at,status,currency,settings,cover_image,location,event_type)").eq("id", id).eq("holder_id", ctx.user.id).maybeSingle();
  if (error) throw new Error("Could not load your ticket. Try again.");
  if (!t) notFound();
  const e = t.event as unknown as Ev;
  const tier = t.tier as unknown as { name: string; price: number } | null;
  const { data: cfg } = await db.from("platform_settings").select("value").eq("section", "ticketing").eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle();
  // Q22 disclosure: the policy in force and what a buyer is told. Both functions are service-only; the ticket is already proven to
  // belong to this customer (holder_id) above, and neither returns anything private.
  const svc = untyped(createAdminClient() as never);
  const [pol, rx] = await Promise.all([
    svc.rpc("resale_policy_for", { p_event: e.id }).then(r => r.data, () => null),
    svc.rpc("ticket_resale_restrictions", { p_ticket: id }).then(r => r.data, () => null),
  ]);
  const policy = (Array.isArray(pol) ? pol[0] : pol) as Policy | null;
  const restr = (rx ?? {}) as Restr;
  const capPct = Number(policy?.price_cap_pct ?? cfg?.value?.resale_cap_pct ?? 100);
  const face = Number(tier?.price ?? 0), cap = (face * capPct) / 100, paid = Number(t.price_paid);
  const purchase = await db.from("checkout_orders").select("buyer_id,status,refund_status,stripe_session,currency").eq("order_ref", t.order_ref).maybeSingle();
  if (purchase.error) throw new Error("Could not check your original payment. Try again.");
  const originalPayer = purchase.data?.buyer_id === ctx.user.id && purchase.data?.status === "issued" && purchase.data?.refund_status === "none" && !!purchase.data?.stripe_session && purchase.data?.currency?.toUpperCase() === "GBP";
  const now = requestTime();
  const cutoffAt = e.starts_at ? Date.parse(e.starts_at) - Number(policy?.listing_cutoff_hours ?? 0) * 36e5 : null;
  const windowOpen = !!e.starts_at && cutoffAt != null && cutoffAt > now && ["published", "on_sale"].includes(e.status);
  const reason = t.status !== "valid" || t.checked_in_at ? "Only valid, unused tickets can be listed."
    : paid <= 0 ? "Free tickets cannot be listed for paid resale."
    : e.settings.resale === false || cfg?.value?.resale_enabled === false ? "Official resale is turned off for this event."
    : !windowOpen ? "The resale window is closed."
    : paid > cap ? "The price you paid is above the resale limit for this event. Contact ticket support."
    : !originalPayer ? "Only the buyer who paid for this ticket can resell it. Transferred tickets and purchases with a refund in progress cannot be listed."
    : null;
  const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: purchase.data?.currency || e.currency || "GBP" }).format(n);
  const restrictions = [restr.min_age ? `${restr.min_age}+ only` : null, "Only your own tickets", "No speculative pricing", "Must be sold on Gala Dock", restr.transfer_allowed === false ? "Not transferable after purchase" : null].filter(Boolean) as string[];
  const steps = ["Eligibility & Price", "Review & List", "Complete"];

  return <div className="rs">
    <div className="rs-top">
      <Link className="rs-back" href={`/account/tickets/${id}`}><ArrowLeft size={16} aria-hidden />Back to My Tickets</Link>
      <ol className="rs-steps" aria-label="Resale steps">{steps.map((s, i) => <li key={s} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""} aria-current={i + 1 === step ? "step" : undefined}><span>{i + 1 < step ? <Check size={14} aria-hidden /> : i + 1}</span>{s}</li>)}</ol>
    </div>
    <div className="rs-grid">
      <div className="rs-main">
        <section className="rs-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.cover_image || "/assets/gd/hero-discover.webp"} alt="" />
          <div>{e.event_type && <span className="rs-chip">{eventTypeLabel(e.event_type)}</span>}<h1>{e.name}</h1>
            <p><span><CalendarDays size={17} aria-hidden />{when(e.starts_at, e.ends_at)}</span>{e.location && <span><MapPin size={17} aria-hidden />{e.location}</span>}</p></div>
        </section>

        <section className="rs-card"><div className="rs-h"><div><h2><b>1.</b>Ticket to resell</h2><p>The ticket you are listing for official resale.</p></div><Link className="k-link" href={`/account/tickets/${id}`}>View ticket <ArrowRight size={14} aria-hidden /></Link></div>
          <div className="rs-ticket">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.cover_image || "/assets/gd/hero-discover.webp"} alt="" />
            <div><b>{e.name}</b><small><CalendarDays size={13} aria-hidden />{when(e.starts_at, e.ends_at)}</small>{e.location && <small><MapPin size={13} aria-hidden />{e.location}</small>}</div>
            <div><span>Ticket type</span><b>{tier?.name ?? "Ticket"}</b><small>{t.seat ? "Seated" : "Standing"}</small></div>
            <div><span>Seat or area</span><b>{t.seat || "General admission"}</b></div>
            <div><span>Original purchase price</span><strong>{money(paid)}</strong><small>Face value {money(face)}</small></div>
          </div></section>

        <section className="rs-card"><div className="rs-h"><div><h2><b>2.</b>Resale eligibility</h2><p>We check this ticket against the event&apos;s resale policy.</p></div></div>
          {reason ? <div className="rs-elig bad" role="status"><XCircle size={22} aria-hidden /><div><b>This ticket can&apos;t be listed</b><p>{reason}</p></div><Link className="k-btn outline" href="/account/help">Ticket help</Link></div>
            : <div className="rs-elig"><CheckCircle2 size={22} aria-hidden /><div><b>This ticket is eligible for official resale</b><p>You can list it through Gala Dock. Resale follows the event&apos;s resale policy.</p></div><Link className="k-btn outline" href={restr.terms_url || "/ticket-terms"}>View full policy</Link></div>}
          <div className="rs-facts">
            <div><CalendarClock size={22} aria-hidden /><div><span className="rs-fh">Resale window {windowOpen ? <em className="open">Open</em> : <em>Closed</em>}</span><b>{policy?.listing_cutoff_hours ? `Now – ${policy.listing_cutoff_hours} hours before the event` : "Until the event starts"}</b>{cutoffAt && <small>Closes {when(new Date(cutoffAt).toISOString(), null)}</small>}</div></div>
            <div><Diamond size={22} aria-hidden /><div><span className="rs-fh">Price limit</span><small>Maximum resale price</small><strong>{money(cap)}</strong><small>{capPct === 100 ? "Face value" : `${capPct}% of face value`}</small></div></div>
            <div><ShieldCheck size={22} aria-hidden /><div><span className="rs-fh">Restrictions</span><ul>{restrictions.map(r => <li key={r}><Check size={14} aria-hidden />{r}</li>)}</ul></div></div>
          </div></section>

        <section className="rs-card rs-split"><div><div className="rs-h"><div><h2><b>3.</b>Resale price</h2><p>Official resale lists your ticket at the price you paid.</p></div></div>
            <label className="rs-price"><span>Resale price per ticket</span><span className="rs-in"><i>£</i><input value={paid.toFixed(2)} readOnly aria-readonly="true" aria-describedby="rs-price-hint" /></span><small id="rs-price-hint">Fixed at the price you paid · Maximum {money(cap)}</small></label></div>
          <dl className="rs-break"><dt className="rs-bh">Estimated breakdown <small>(per ticket)</small></dt>
            <div><dt>Listing price</dt><dd>{money(paid)}</dd></div><div><dt>Gala Dock resale fee</dt><dd>{money(0)}</dd></div><div><dt>Original booking fee</dt><dd>Not refunded</dd></div>
            <div className="tot"><dt>Refund to you when it sells</dt><dd>{money(paid)}</dd></div></dl></section>

        <section className="rs-card"><div className="rs-h"><div><h2><b>4.</b>Where the money goes</h2><p>When a buyer completes their purchase, the ticket price is refunded to how you paid.</p></div></div>
          <div className="rs-pay"><span className="on" aria-current="true"><CreditCard size={18} aria-hidden /><span><b>Original payment method</b><small>Refunded after the sale completes · your bank controls when it appears</small></span><em>Default</em></span></div></section>

        {/* Step 2 for an ineligible ticket (e.g. received by transfer, or no longer the holder): a clear heading instead of an empty review. */}
        {step === 2 && reason && <section className="rs-card"><div className="rs-h"><div><h2>Resale unavailable</h2><p>{reason}</p></div></div><Link className="k-btn outline" href={`/account/tickets/${id}`}>Back to ticket</Link></section>}
        {step === 2 && !reason && <section className="rs-card"><div className="rs-h"><div><h2>Review and list</h2><p>Your current QR code is paused while the ticket is listed and replaced after a completed sale. You can withdraw while no buyer has an active reservation.</p></div></div>
          <ResaleReview ticketId={id} /></section>}
        <div className="rs-foot"><Link className="k-btn outline" href={`/account/tickets/${id}`}>Cancel</Link>{step === 1 && !reason && <Link className="k-btn primary" href="?step=2">Continue to Review <ArrowRight size={15} aria-hidden /></Link>}</div>
      </div>

      <aside className="rs-side">
        <section className="rs-card"><div className="rs-sh"><span className="rs-ic"><FileText size={20} aria-hidden /></span><div><h2>Resale rules</h2><p>Official resale only{policy ? ` · ${policy.jurisdiction} policy v${policy.version}` : ""}</p></div></div>
          <ul className="rs-rules">
            <li><Diamond size={16} aria-hidden /><div><b>Face value or less</b><p>Tickets can be listed at up to {capPct === 100 ? "their face value" : `${capPct}% of face value`} ({money(cap)} for this ticket).</p></div></li>
            <li><Lock size={16} aria-hidden /><div><b>No speculative resale</b><p>Tickets cannot be listed above the allowed limit{policy?.max_active_listings_per_user ? `, and you can have at most ${policy.max_active_listings_per_user} active listings` : ""}.</p></div></li>
            <li><Repeat size={16} aria-hidden /><div><b>Secure and safe</b><p>Once sold, your ticket is cancelled and a new ticket is issued in the buyer&apos;s name.</p></div></li>
          </ul>
          {policy?.legal_review_status === "needs_review" && <p className="rs-note">These resale rules are pending legal review.</p>}</section>
        <section className="rs-card"><div className="rs-sh"><span className="rs-ic"><CircleHelp size={20} aria-hidden /></span><div><h2>Resale help</h2><p>Answers to common questions</p></div></div>
          <div className="rs-faq">
            <details><summary><ChevronRight size={14} aria-hidden />What is the maximum resale price?</summary><p>{money(cap)} for this ticket — {capPct === 100 ? "its face value" : `${capPct}% of its face value`}. Official resale lists it at the price you paid.</p></details>
            <details><summary><ChevronRight size={14} aria-hidden />When does the resale window close?</summary><p>{cutoffAt ? `${when(new Date(cutoffAt).toISOString(), null)}.` : "When the event starts."} Unsold listings lapse and your ticket becomes usable again.</p></details>
            <details><summary><ChevronRight size={14} aria-hidden />What fees are deducted?</summary><p>No resale fee is taken from you. Your original booking fee isn&apos;t refunded. The buyer pays their own booking fee.</p></details>
            <details><summary><ChevronRight size={14} aria-hidden />What happens to my original ticket?</summary><p>Its QR code is paused while listed. When it sells, it&apos;s cancelled and the buyer gets a new one.</p></details>
            <details><summary><ChevronRight size={14} aria-hidden />Can I change the price later?</summary><p>No — official resale uses the price you paid. You can withdraw the listing while no buyer is checking out.</p></details>
          </div></section>
      </aside>
    </div>
  </div>;
}
