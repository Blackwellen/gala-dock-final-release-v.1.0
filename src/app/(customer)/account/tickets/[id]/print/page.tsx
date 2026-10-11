import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPrintable } from "@/lib/tickets/printable";
import { PrintButton } from "./print-button";
import "@/styles/ticket-print.css";

export const metadata = { title: "Print ticket" };
const fmt = (iso: string | null, tz: string, o: Intl.DateTimeFormatOptions) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).format(new Date(iso)) : "To be confirmed";

/** Print-optimised ticket (user addition). Uses the static print credential; the wallet keeps the rotating one. */
export default async function PrintTicketPage({ params }: PageProps<"/account/tickets/[id]/print">) {
  const { id } = await params;
  const r = await loadPrintable(id);
  if (!r.ok) { if (r.status === 404 || r.status === 401) notFound(); return <main className="tp-wrap"><p className="tp-err">{r.error}</p><Link href={`/account/tickets/${id}`}>Back to ticket</Link></main>; }
  const t = r.t, tz = t.event.timezone;
  return <main className="tp-wrap">
    <div className="tp-actions"><Link href={`/account/tickets/${id}`}>← Back to ticket</Link><span><a className="tp-btn ghost" href={`/api/tickets/${id}/pdf`}>Download PDF</a><PrintButton /></span></div>
    <article className="tp-ticket" aria-label={`Ticket ${t.code}`}>
      <header><small>GALA DOCK</small><h1>{t.event.name}</h1></header>
      <div className="tp-body">
        <dl>
          <div><dt>Date</dt><dd>{fmt(t.event.startsAt, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd></div>
          <div><dt>Time</dt><dd>{fmt(t.event.startsAt, tz, { hour: "2-digit", minute: "2-digit" })}{t.event.endsAt ? ` – ${fmt(t.event.endsAt, tz, { hour: "2-digit", minute: "2-digit" })}` : ""}</dd></div>
          <div><dt>Venue</dt><dd>{[t.event.venue, t.event.address].filter(Boolean).join(", ") || "To be confirmed"}</dd></div>
          <div><dt>Ticket holder</dt><dd>{t.attendee || "Ticket holder"}</dd></div>
          <div><dt>Ticket</dt><dd>{t.tier}</dd></div>
          {t.seat && <div><dt>Seat</dt><dd>{t.seat}</dd></div>}
          <div><dt>Order reference</dt><dd>{t.orderRef}</dd></div>
        </dl>
        <figure>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={t.qrDataUrl} alt={`Entry code for ticket ${t.code}`} /><figcaption>{t.code}</figcaption></figure>
      </div>
      <p className="tp-note">Show this code at the entrance. It is unique to this ticket — copies are refused once scanned. Transferring or reselling through Gala Dock replaces this code.</p>
      <section className="tp-terms"><h2>Terms</h2><p>{t.event.terms}</p></section>
    </article>
  </main>;
}
