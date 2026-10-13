import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, CheckCircle2, Clock4, CalendarDays, MessagesSquare, Wallet, Users, ShieldCheck } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { getMyEvent } from "@/lib/data/customer-events";
import { questionsFor } from "@/lib/booking-questions";
import { stripeKey } from "@/lib/stripe";
import { savedCards } from "@/lib/payments";
import { VSteps } from "@/components/kit";
import { BookingFlow, type BookingData } from "@/components/customer/booking-flow";
import { money, dateLong } from "@/lib/format";
import { listingHref } from "@/lib/links";

export const metadata = { title: "Booking request" };
const OPEN = ["suggested", "draft", "sent", "awaiting", "clarification", "available", "quoted", "held", "expired", "declined", "unavailable", "standby"];

export default async function BookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer(); const d = await getMyEvent(ctx, id); const e = d.e;
  const it = d.items.find(i => i.id === sp.item) ?? (sp.item ? null : d.items.find(i => i.category === "venue" && OPEN.includes(i.status)) ?? d.items.find(i => OPEN.includes(i.status)));
  if (!it) redirect(`/account/events/${e.id}/build`);
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1));
  const base = `/account/events/${e.id}/book?item=${it.id}${sp.option === "hold" ? "&option=hold" : ""}`;
  const [{ data: l }, { data: pkg }, { data: pr }, { data: revs }] = await Promise.all([
    it.listing_id ? ctx.supabase.from("listings").select("id,name,kind,category,location,city,image,gallery,rating,review_count,capacity_max,price_from,price_unit,response_hours,description,details,tags,instant_book,slug").eq("id", it.listing_id).maybeSingle() : Promise.resolve({ data: null }),
    it.listing_id ? ctx.supabase.from("packages").select("name,description,base_price,price_basis,image,deposit_pct,inclusions").eq("listing_id", it.listing_id).eq("status", "published").order("base_price").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    it.request_id ? ctx.supabase.from("provider_requests").select("requirements,status,response_deadline").eq("id", it.request_id).maybeSingle() : Promise.resolve({ data: null }),
    it.listing_id ? ctx.supabase.from("reviews").select("rating,body,created_at").eq("listing_id", it.listing_id).eq("status", "published").order("created_at", { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
  ]);
  const kindLabel = l?.kind === "venue" || it.category === "venue" ? "Venue" : "Provider";
  const crumbs = <nav className="bk-crumbs" aria-label="Breadcrumb"><Link href={`/account/events/${e.id}/build`} aria-label="Back to build"><ArrowLeft size={14} /></Link><Link href="/account/events">My Events</Link><ChevronRight size={12} /><Link href={`/account/events/${e.id}`}>{e.name}</Link><ChevronRight size={12} /><span aria-current="page">Book {kindLabel}</span></nav>;
  const steps = [{ title: "Requirements", sub: "Confirm details and answer provider questions" }, { title: it.status === "quoted" || it.status === "available" || it.status === "held" ? "Review & Book" : "Terms, Hold & Payment", sub: "Choose your option and review the commitment" }, { title: "Confirmation", sub: "Request sent to provider" }];

  if (step === 3) {
    const done = ["confirmed", "fulfilled"].includes(it.status);
    const head = done ? `${it.title} is booked` : it.status === "standby" ? `You're on ${it.title}'s standby list` : it.status === "held" ? `Hold requested from ${it.title}` : `Request sent to ${it.title}`;
    const deadline = it.response_deadline ? new Date(it.response_deadline) : null;
    const next = done ? [["Deposit paid", "Your receipt is in Money."], ["Balance scheduled", "We'll remind you before it's due."], ["Provider preparing", "They'll confirm final details in Messages."]]
      : it.status === "standby" ? [["Standby registered", "The provider knows you're interested."], ["We'll alert you", "If the date opens up, you'll hear first."], ["No commitment", "Nothing is booked or charged."]]
      : [["Provider reviews your request", deadline ? `They have until ${deadline.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })} to respond.` : "They have 48 hours to respond."], ["You receive a formal quote", "Compare it in your build before deciding."], ["You choose to book", "No payment is taken unless you approve a quote."]];
    return <div className="bk">
      <div className="bk-head">{crumbs}</div>
      <div className="bk-grid">
        <aside className="bk-rail"><VSteps steps={steps} current={3} /></aside>
        <section className="ce-card bk-done">
          <span className="bk-done-ic"><CheckCircle2 size={34} /></span>
          <h1>{head}</h1>
          <p className="ce-sub">{done ? "Your booking is confirmed and the provider has been notified." : "We've shared your requirements with the provider and added this to your build."}</p>
          <div className="bk-done-card">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={it.image || l?.image || "/assets/gd/oe-neon.webp"} alt="" /><div className="k-grow"><b>{it.title}</b><small><CalendarDays size={13} />{dateLong(e.starts_at)}</small><small><Users size={13} />{e.guest_count} guests</small></div><div className="bk-done-amt"><b>{it.amount != null ? money(it.amount) : "Quote pending"}</b><small>{done ? "Confirmed" : it.status === "standby" ? "Standby" : "Estimate"}</small></div></div>
          <ol className="bk-next">{next.map(([t, s], i) => <li key={t}><span>{i + 1}</span><div><b>{t}</b><small>{s}</small></div></li>)}</ol>
          <div className="k-row k-wrap" style={{ gap: 10, justifyContent: "center" }}>
            <Link className="k-btn primary" href={`/account/events/${e.id}/build`}>Back to your build</Link>
            <Link className="k-btn outline" href={`/account/events/${e.id}/messages?listing=${it.listing_id ?? ""}`}><MessagesSquare size={15} />Message {it.title}</Link>
            {done && <Link className="k-btn outline" href={`/account/events/${e.id}/money`}><Wallet size={15} />View payments</Link>}
          </div>
          {deadline && !done && <p className="k-small bk-done-note"><Clock4 size={13} />Not answered in time? The request expires — that never counts as a decline, and you can request again or pick an alternative.</p>}
        </section>
        <aside className="ce-card bk-agent"><div className="k-row" style={{ gap: 8 }}><ShieldCheck size={18} className="k-blue" /><b>Keep your date safe</b></div><p className="k-small">While you wait for a reply, line up a backup option.</p><Link className="k-btn outline block" href={`/account/events/${e.id}/build?cat=${it.category}`}>Find a backup {kindLabel.toLowerCase()}</Link></aside>
      </div>
    </div>;
  }

  const req = (pr?.requirements ?? {}) as Partial<BookingData["saved"]>;
  const start = e.starts_at ? new Date(e.starts_at) : null; const end = e.ends_at ? new Date(e.ends_at) : null;
  // Event times are shown and edited in the event's local time (UK).
  const hhmm = (dt: Date | null, f: string) => dt ? dt.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }) : f;
  const ymd = (dt: Date | null) => dt ? dt.toLocaleDateString("en-CA", { timeZone: "Europe/London" }) : "";
  const sk = stripeKey(); const def = (await savedCards(ctx)).find(c => c.isDefault);
  const data: BookingData = {
    event: { id: e.id, name: e.name, date: ymd(start), start: hhmm(start, "18:00"), end: hhmm(end, "23:00"), guests: e.guest_count, adults: e.adults, children: e.children, location: e.location },
    item: { id: it.id, title: it.title, status: it.status, category: it.category, amount: it.amount == null ? null : Number(it.amount), deposit: Number(it.deposit ?? 0), package: it.package, image: it.image, quote: (it.quote ?? {}) as BookingData["item"]["quote"], hold_expires_at: it.hold_expires_at, response_deadline: it.response_deadline },
    listing: l ? { id: l.id, name: l.name, kind: l.kind, category: l.category, location: l.location || l.city, image: l.image, gallery: (l.gallery ?? []).slice(0, 8), rating: Number(l.rating ?? 0), reviews: l.review_count ?? 0, capacity: l.capacity_max, price_from: l.price_from == null ? null : Number(l.price_from), price_unit: l.price_unit, response_hours: l.response_hours ?? 48, description: l.description, setting: String((l.details as Record<string, unknown> | null)?.setting ?? ""), tags: l.tags ?? [], href: listingHref(l.kind, l.slug, l.id) } : null,
    pkg: pkg ? { name: pkg.name, description: pkg.description, price: Number(pkg.base_price), image: pkg.image } : null,
    reviews: (revs ?? []).map(r => ({ rating: r.rating, body: r.body })),
    questions: questionsFor(it.category, l?.details),
    saved: { date: req.date ?? ymd(start), start: req.start ?? hhmm(start, "18:00"), end: req.end ?? hhmm(end, "23:00"), flexible_dates: req.flexible_dates ?? false, guests: req.guests ?? e.guest_count, adults: req.adults ?? e.adults ?? undefined, children: req.children ?? e.children ?? undefined, setup: req.setup ?? "", breakdown: req.breakdown ?? "", access: req.access ?? "standard", notes: req.notes ?? "", answers: req.answers ?? {}, alt_dates: req.alt_dates ?? true, standby_interest: req.standby_interest ?? false },
    savedOption: ((pr?.requirements as { option?: string } | null)?.option ?? (sp.option === "hold" ? "hold" : null)) as BookingData["savedOption"],
    submitted: pr?.status === "sent",
    card: def ? { brand: def.brand, last4: def.last4, exp: def.exp, test: false } : sk?.startsWith("sk_test_") ? { brand: "Visa", last4: "4242", exp: "12/2034", test: true } : null,
  };
  return <div className="bk">
    <div className="bk-head">{crumbs}<div className="bk-title"><h1>Booking Request</h1><p className="ce-sub">{step === 1 ? "Tell the provider what you need. This will be sent as a request for availability and a quote." : "Choose how you'd like to proceed, review the terms and add a payment method. No payment is taken unless you approve a quote."}</p></div></div>
    <BookingFlow step={step as 1 | 2} base={base} data={data} steps={steps} />
  </div>;
}
