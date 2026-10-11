import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Ticket Purchase & Resale Terms · Gala Dock", description: "Buying, transferring and reselling tickets on Gala Dock, including cancellations and refunds." };

export default function TicketTerms() {
  return <article>
    <h1>Ticket Purchase &amp; Resale Terms</h1>
    <p className="lg-meta">Version {LEGAL.version} · effective {LEGAL.effective}</p>
    <p>These terms apply when you buy, hold, transfer or resell tickets on {LEGAL.service}, together with our <Link href="/terms">Terms of Service</Link>. The event organiser is responsible for the event and sets its entry conditions. {LEGAL.service} sells tickets on the organiser’s behalf.</p>

    <h2 id="buying">1. Buying tickets</h2>
    <ul>
      <li>The ticket price, any booking fee and the total are shown before you pay.</li>
      <li>While you check out, your chosen tickets or seats are held for a short time; the countdown is shown on screen. If the hold expires, they are released.</li>
      <li>There may be a limit on how many tickets you can buy in one order.</li>
      <li>Your order is confirmed only when payment succeeds. If the hold lapsed before payment completed, your payment is refunded automatically.</li>
      <li>Organisers may set conditions such as age limits, ID checks, a dress code or a bag policy. These are shown on the event page and form part of the ticket.</li>
    </ul>

    <h2 id="cancellation">2. No 14-day cancellation period</h2>
    <p>Tickets are for leisure services on a specific date. Under regulation 28(1)(g) of the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, you do not have the usual 14-day right to cancel. You can still transfer or resell your ticket as described below.</p>

    <h2 id="changes">3. If the event is cancelled, postponed or changed</h2>
    <ul>
      <li><b>Cancelled:</b> you get a full refund of the ticket price and booking fee to your original payment method.</li>
      <li><b>Postponed or moved:</b> your ticket is valid for the new date. If you can’t attend, you can ask for a refund within the period the organiser announces, which will be at least 14 days.</li>
      <li><b>Materially changed</b> (for example, the headline act changes): your rights depend on the organiser’s announced policy and your statutory rights.</li>
    </ul>

    <h2 id="tickets">4. Your ticket</h2>
    <ul>
      <li>Your ticket has a secure QR code that refreshes regularly. Screenshots may not scan, so show it from your account or wallet.</li>
      <li>You can transfer a ticket to another person until shortly before the event. The new holder receives a new code, and the old code stops working.</li>
      <li>A ticket admits one person once. Copied or fraudulent tickets will be refused entry.</li>
    </ul>

    <h2 id="resale">5. Fan-to-fan resale</h2>
    <ul>
      <li>Where the organiser allows it, you can list a ticket for resale on {LEGAL.service}. Resale prices are capped at the original price paid.</li>
      <li>As section 90 of the Consumer Rights Act 2015 requires, buyers are shown:
        <ul>
          <li>the seat or standing area;</li>
          <li>any restrictions; and</li>
          <li>the original face value.</li>
        </ul></li>
      <li>When a resale ticket sells, the seller’s ticket is cancelled and the buyer gets a new ticket for the same seat.</li>
      <li>The seller’s proceeds are paid out once the payment is settled.</li>
      <li>You must not resell tickets elsewhere in breach of the organiser’s conditions. Tickets found to be touted may be cancelled.</li>
    </ul>

    <h2 id="seating">6. Seated events</h2>
    <p>Where you choose a seat or table on the venue plan, it is held for you during checkout and assigned to your ticket when payment succeeds. The organiser may move seats to an equal or better position for safety or operational reasons.</p>

    <h2 id="contact">7. Help</h2>
    <p>For anything about the event itself, contact the organiser through the event page. For orders, refunds and transfers, contact <a href={`mailto:${LEGAL.contact.support}`}>{LEGAL.contact.support}</a>.</p>
  </article>;
}
