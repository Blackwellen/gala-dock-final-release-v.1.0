import type { Metadata } from "next";
import Link from "next/link";
import { GalaLogo } from "@/components/brand/gala-logo";
import { LegalFooter } from "@/components/public/token-chrome";
import { redirect } from "next/navigation";
import { CircleCheck, CircleAlert, Ticket, CalendarDays, MapPin, ArrowRight } from "lucide-react";
import "@/styles/checkout.css";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

export const metadata: Metadata = { title: "Order status" };
const ISSUE: Record<string, string> = { refunded: "Your payment has been refunded. Check your original payment method for the return of funds.", refund_pending: "Your refund is being processed. It will only be marked completed when the payment provider confirms it.", tickets_unavailable: "The tickets on this order are no longer active on your account. Open My Tickets to check their current status.", not_paid: "We haven’t received confirmation of your payment yet. If you were charged, your tickets will appear in your account shortly." };

/** Order confirmation. Tickets are read through the buyer's own RLS (holder_id = auth.uid()). */
export default async function Confirmation(props: PageProps<"/checkout/[event]/confirmation">) {
  const { event: key } = await props.params;
  const sp = await props.searchParams;
  const order = typeof sp.order === "string" && /^GD-[0-9A-F]{10}$/.test(sp.order) ? sp.order : null;
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout/${key}/confirmation?order=${order ?? ""}`)}`);
  const [{ data: o }, { data: tickets }] = order ? await Promise.all([
    sb.from("checkout_orders").select("order_ref,status,amount,fee,lines,event_id,refund_status").eq("order_ref", order).maybeSingle(),
    sb.from("tickets").select("id,code,seat,status,price_paid,ticket_tiers(name),events(name,starts_at,venue_name,city,slug)").eq("order_ref", order).eq("holder_id", user.id),
  ]) : [{ data: null }, { data: [] }];
  type T = { id: string; code: string; status: string; seat: string | null; ticket_tiers: { name: string } | null; events: { name: string; starts_at: string | null; venue_name: string; city: string; slug: string } | null };
  const list = ((tickets ?? []) as unknown as T[]).filter(t=>['valid','used'].includes(t.status));
  const ev = (list[0]?.events ?? null) as { name: string; starts_at: string | null; venue_name: string; city: string; slug: string } | null;
  // The query string is not evidence that a refund or payment happened.
  const issue = !o ? null : o.status === "refunded" || o.refund_status === "refunded" ? "refunded" : ["due", "processing", "failed"].includes(o.refund_status) ? "refund_pending" : o.status === 'issued' && !list.length ? 'tickets_unavailable' : "not_paid";
  const ok = !!o && o.status === "issued" && !['refunded','refund_pending'].includes(issue ?? '') && list.length > 0;
  return <div className="co co-done">
    <header className="co-top"><Link href="/" className="co-logo" aria-label="Gala Dock home"><GalaLogo /></Link></header>
    <main className="co-card co-confirm">
      {ok ? <><span className="co-ok"><CircleCheck aria-hidden="true" /></span><h1>You’re going!</h1><p>Order <b>{order}</b> · {list.length} ticket{list.length === 1 ? "" : "s"} on your account · order payment {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(o.amount) + Number(o.fee))}</p>
        {ev && <p className="co-evline"><CalendarDays aria-hidden="true" />{ev.starts_at ? new Date(ev.starts_at).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Date TBA"}<MapPin aria-hidden="true" />{[ev.venue_name, ev.city].filter(Boolean).join(", ")}</p>}
        <ul className="co-tix">{list.map(t => <li key={t.id}><Ticket aria-hidden="true" /><span><b>{t.ticket_tiers?.name ?? "Ticket"}</b><small>{t.seat ?? "General admission"}</small></span><code>{t.code}</code></li>)}</ul>
        <div className="co-actions"><Link href="/account/tickets" className="co-cta">View tickets in my account<ArrowRight aria-hidden="true" /></Link>{ev && <Link href={`/events/${ev.slug}`} className="co-link">Back to event</Link>}</div></>
      : <><span className="co-warn"><CircleAlert aria-hidden="true" /></span><h1>{issue === "refunded" ? "Payment refunded" : issue === "refund_pending" ? "Refund in progress" : issue === "tickets_unavailable" ? "Ticket status changed" : "We’re confirming your order"}</h1>
        <p>{ISSUE[issue ?? ""] ?? (o?.status === "pending" || o?.status === "paid" ? "Your payment is being confirmed. This page will show your tickets once it completes." : "We couldn’t find this order on your account.")}</p>
        <div className="co-actions"><Link href={`/checkout/${key}`} className="co-cta">Back to tickets</Link><Link href="/account" className="co-link">My account</Link></div></>}
    </main>
    <LegalFooter />
  </div>;
}
