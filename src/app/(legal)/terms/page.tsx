import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service · Gala Dock", description: "The terms that apply when you use Gala Dock as a customer, organiser, venue or service provider." };

export default function Terms() {
  return <article>
    <h1>Terms of Service</h1>
    <p className="lg-meta">Version {LEGAL.version} · effective {LEGAL.effective}</p>
    <p>These terms form an agreement between you and {LEGAL.entity.name} about using {LEGAL.service}. Please read them with our <Link href="/privacy">Privacy Policy</Link>. Our <Link href="/ticket-terms">Ticket Purchase &amp; Resale Terms</Link> also apply if you buy, transfer or resell tickets. If you are a consumer, nothing in these terms affects your statutory rights, including those under the Consumer Rights Act 2015.</p>

    <h2 id="service">1. What Gala Dock is</h2>
    <p>{LEGAL.service} is a platform for planning events, selling tickets and booking venues and services. It connects:</p>
    <ul>
      <li><b>customers</b>, who plan personal events and buy tickets;</li>
      <li><b>organisers</b>, who run events, sell tickets and manage teams; and</li>
      <li><b>providers</b>, venues and suppliers who list spaces, services and packages.</li>
    </ul>
    <p>{LEGAL.service} is software. Organisers, venues and suppliers are <b>independent businesses that use our software</b> under their own agreements with us. They are not our employees, workers, partners or contractors, and they don’t act for us. When you buy a ticket or book a venue or service, your contract for that event, venue or service is with the organiser or provider, and they are responsible for delivering it. We provide the platform, collect payments on their behalf, and help resolve disputes.</p>

    <h2 id="accounts">2. Your account</h2>
    <ul>
      <li>You must be 18 or over and give accurate information.</li>
      <li>Keep your password and two-step verification secure. You are responsible for activity on your account.</li>
      <li>One login can belong to several workspaces. Workspace owners decide who joins and what each member can do. A workspace owner is responsible for the actions of its members on the platform.</li>
    </ul>

    <h2 id="marketplace">3. Requests, quotes and bookings</h2>
    <ul>
      <li>Providers set their own prices, deposits, balance dates, cancellation terms, hold and standby options and response times. These are shown before you book.</li>
      <li>A booking is confirmed when the provider accepts it (or it is instant-booked) and any required deposit is paid. The terms shown at that moment are saved with the booking. Later changes to a listing do not alter an accepted booking.</li>
      <li>A request that is not answered in time is marked expired, not declined.</li>
      <li>Conditional holds and standby options last only for the period shown.</li>
      <li>Cancellations follow the saved terms of that booking, together with your statutory rights. Refunds are paid to the original payment method.</li>
    </ul>

    <h2 id="fees">4. Fees and payments</h2>
    <ul>
      <li>All of our fees are <b>platform usage fees</b> for using the {LEGAL.service} software and payment tools. They are shown before you pay or agree.</li>
      <li><b>Tickets:</b> buyers pay a booking fee of {LEGAL.fees.ticketBuyer}. Ticket sellers pay {LEGAL.fees.ticketSeller}, deducted from their proceeds.</li>
      <li><b>Venue and supplier bookings:</b> providers pay commission of {LEGAL.fees.supplier}. Customers pay a booking admin fee of {LEGAL.fees.bookingAdmin}, shown as its own line at checkout.</li>
      <li>Plans may also carry a subscription, shown in workspace settings. Prices for business users exclude VAT.</li>
      <li>If an organiser cancels an event after tickets have sold, buyers are always refunded in full, including the booking fee. The organiser still owes the platform fees on the tickets sold, unless Gala Dock accepts that the event couldn’t lawfully or safely go ahead for reasons outside the organiser’s control (force majeure), in which case the fees are waived.</li>
      <li>Payments are processed by Stripe. Payouts go to the provider’s or organiser’s connected Stripe account, after any holding period and minus fees, refunds and chargebacks.</li>
      <li>Members must not take payment outside the platform for bookings arranged through it.</li>
    </ul>

    <h2 id="providers">5. Additional obligations for providers and organisers</h2>
    <ul>
      <li>Keep your listings, capacities, prices and availability accurate, and honour accepted bookings.</li>
      <li>Hold the licences, permissions, insurance and certifications your activity needs, and keep the documents you give us valid.</li>
      <li>Follow the law, including on health and safety, licensing, equality, consumer protection, data protection and tax.</li>
      <li>Where you process attendees’ or customers’ personal data, you are its controller and must handle it lawfully.</li>
      <li>You are responsible, and liable, for your events, venues and services, and for what happens at them. You indemnify us against claims arising from them.</li>
    </ul>

    <h2 id="conduct">6. Acceptable use</h2>
    <p>You must not:</p>
    <ul>
      <li>break the law or infringe anyone’s rights;</li>
      <li>post false, misleading, discriminatory, hateful or harassing content;</li>
      <li>commit fraud, ticket touting or scalping;</li>
      <li>interfere with the platform or other members’ accounts; or</li>
      <li>scrape or copy the platform at scale.</li>
    </ul>
    <p>We may remove content, pause listings, restrict accounts or withhold payouts while we investigate, and act on the outcome.</p>

    <h2 id="content">7. Your content</h2>
    <p>You keep ownership of what you upload, including photos, listings, plans and messages. You give us a licence to host, display and process it, but only to run and promote the service. For public listings and event pages, this includes showing them in search and marketing. The licence ends when you delete the content, except where we must keep it (see our <Link href="/data-retention">Data Retention Schedule</Link>).</p>

    <h2 id="agent">8. Gala Agent (AI features)</h2>
    <p>Gala Agent can draft messages, plans and suggestions, and can carry out actions you approve. Its output may be inaccurate, so check it before relying on it. Actions that send messages, commit to bookings or move money need your approval, and you are responsible for the actions you approve.</p>

    <h2 id="disputes">9. Problems and disputes</h2>
    <p>Contact the other party first. If you can’t resolve it, open a dispute from the booking or contact <a href={`mailto:${LEGAL.contact.support}`}>{LEGAL.contact.support}</a>. We will review the evidence and the saved booking terms, and we may decide how the funds we hold are released or refunded. This does not prevent you from going to court or using an approved alternative dispute resolution scheme.</p>

    <h2 id="liability">10. Our liability</h2>
    <ul>
      <li>We do not exclude or limit our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot be limited by law.</li>
      <li>If you are a consumer, we are responsible for loss you suffer that is a foreseeable result of our breaking these terms or failing to use reasonable care and skill. Organisers and providers, not {LEGAL.service}, are responsible for their events and services and for any loss they cause. Your rights against them are not affected.</li>
      <li>If you use the platform for business, we are not liable for indirect or consequential loss, or for loss of profit, revenue, business, goodwill or data. Our total liability in any 12 months is limited to the greater of the fees you paid us in that period and {LEGAL.liabilityFloor}. Money we hold that is payable to you does not count towards this limit.</li>
    </ul>

    <h2 id="ending">11. Suspension and closing your account</h2>
    <p>You can close your account at any time from Settings. Accepted bookings, tickets and any amounts owed are not affected by closing it. We may suspend or close accounts that breach these terms or put members at risk. Where it is safe and lawful to do so, we will give reasons and a chance to respond.</p>

    <h2 id="changes">12. Changes</h2>
    <p>We may update these terms to reflect changes in the law or the service, and we will give reasonable notice of significant changes. Bookings already accepted stay under the terms that applied when they were accepted.</p>

    <h2 id="law">13. Law and courts</h2>
    <p>These terms are governed by {LEGAL.law}. If you are a consumer living in Scotland or Northern Ireland, you can also bring proceedings in your local courts.</p>
    <p>Contact: <a href={`mailto:${LEGAL.contact.legal}`}>{LEGAL.contact.legal}</a>.</p>
  </article>;
}
