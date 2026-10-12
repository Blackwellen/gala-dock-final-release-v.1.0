import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · Gala Dock", description: "How Gala Dock collects, uses, shares and protects personal data under UK GDPR and the Data Protection Act 2018." };

export default function PrivacyPolicy() {
  const { contact, dpo, ico } = LEGAL;
  return <article>
    <h1>Privacy Policy</h1>
    <p className="lg-meta">Version {LEGAL.version} · effective {LEGAL.effective}</p>
    <p>This policy explains how {LEGAL.service} (“we”, “us”) collects and uses personal data when you use {LEGAL.site}, our apps and our services as a customer, event organiser, venue or service provider, team member, promoter or partner. We follow the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018 and the Privacy and Electronic Communications Regulations 2003 (PECR).</p>

    <h2 id="who">1. Who we are and how to contact us</h2>
    <p>{LEGAL.entity.name}{LEGAL.entity.number ? ` (company number ${LEGAL.entity.number})` : ""}{LEGAL.entity.address ? `, ${LEGAL.entity.address}` : ""} is the controller of the personal data described here, except where section 3 says otherwise. We are registered with the Information Commissioner’s Office under registration number {LEGAL.entity.ico}.</p>
    <p>Our Data Protection Officer is {dpo.name}. Contact the DPO at <a href={`mailto:${contact.privacy}`}>{contact.privacy}</a> about anything in this policy or to exercise your rights.</p>

    <h2 id="collect">2. The personal data we collect</h2>
    <ul>
      <li><b>Account and profile:</b> name, email, phone, password (stored only as a secure hash), profile photo, home area, language, interests, notification and marketing preferences, and two-step verification settings.</li>
      <li><b>Events and planning:</b> events you create or join, guest lists, plans, budgets, tasks, programmes and run sheets, seating and venue layouts.</li>
      <li><b>Marketplace activity:</b> enquiries, requests, quotes, holds, bookings, cancellations, reviews and disputes between customers, organisers and providers.</li>
      <li><b>Tickets:</b> orders, ticket holder and attendee names, seats, transfers, resale listings and check-in records.</li>
      <li><b>Payments:</b> amounts, payment status, refunds and payouts. Card details are collected and stored by our payment processor, Stripe; we never see or store your full card number.</li>
      <li><b>Providers and workspaces:</b> business details, listings, team members, credentials and insurance documents, and payout and identity-verification status supplied through Stripe Connect.</li>
      <li><b>Messages:</b> conversations between members, workspaces and our support team.</li>
      <li><b>Support and safety:</b> support cases, trust and safety reports, and fraud and risk signals.</li>
      <li><b>Technical data:</b> device and browser information, IP address, sign-in events, security logs, and the cookies described in our <Link href="/cookies">Cookie Policy</Link>.</li>
      <li><b>Gala Agent:</b> the instructions you give our AI assistant and the actions it prepares or takes for you.</li>
    </ul>

    <h2 id="roles">3. When an organiser or provider is the controller</h2>
    <p>When an organiser invites guests, manages attendees or shares a guest list, or a provider manages its own customers or staff, that organiser or provider decides how that data is used and is the controller of it. We process it on their behalf as a processor, under contract. Questions about those uses should go to the organiser or provider first; we will help them respond.</p>

    <h2 id="use">4. How we use your data and our lawful bases</h2>
    <table><thead><tr><th>Purpose</th><th>Lawful basis (UK GDPR Art. 6)</th></tr></thead><tbody>
      <tr><td>Create and run your account; provide planning, marketplace, ticketing and messaging features</td><td>Contract (6(1)(b))</td></tr>
      <tr><td>Take payments, issue tickets, pay providers and sellers, and process refunds</td><td>Contract; legal obligation for financial records (6(1)(c))</td></tr>
      <tr><td>Keep the platform secure, prevent fraud and abuse, verify providers, and enforce our terms</td><td>Legitimate interests (6(1)(f)) in a safe and trustworthy marketplace; legal obligation where we must</td></tr>
      <tr><td>Investigate safety reports, disputes and legal requests, including authorised staff access to messages (section 7)</td><td>Legitimate interests; legal obligation; vital interests (6(1)(d)) where someone is at risk</td></tr>
      <tr><td>Service messages about your bookings, tickets, account and security</td><td>Contract; legitimate interests</td></tr>
      <tr><td>Marketing emails and personalised recommendations</td><td>Consent (6(1)(a)), which you can withdraw at any time in your settings or from any email</td></tr>
      <tr><td>Improve and develop our services, including aggregated analytics</td><td>Legitimate interests</td></tr>
      <tr><td>Gala Agent: prepare drafts, suggestions and approved actions</td><td>Contract; actions that change bookings or spend money need your approval</td></tr>
    </tbody></table>
    <p>We use risk scoring to flag possible fraud or policy breaches. A person reviews any decision that significantly affects you, such as suspending an account or withholding a payout. We do not make solely automated decisions with legal or similarly significant effects (UK GDPR Art. 22).</p>

    <h2 id="share">5. Who we share data with</h2>
    <ul>
      <li><b>Other members, where needed to provide the service:</b> for example, your booking details go to the provider you book, and attendee names go to the event organiser.</li>
      <li><b>Service providers acting for us:</b>
        <ul>
          <li>Stripe: payments, Connect payouts and identity checks</li>
          <li>Supabase: database, authentication and file storage</li>
          <li>Vercel: hosting</li>
          <li>Our email delivery provider: account, booking and ticket emails</li>
          <li>Microsoft (Azure OpenAI): AI processing for Gala Agent, in the UK or the EEA</li>
          <li>Anthropic: AI processing for some assistant features, such as onboarding help</li>
          <li>Map services, such as OpenStreetMap, for venue maps</li>
        </ul>
        Each is bound by a contract that limits its use of your data.</li>
      <li><b>Authorities and advisers:</b> where the law requires it, to protect someone’s safety, or to establish or defend legal claims.</li>
      <li><b>A buyer of our business:</b> if we sell all or part of it, subject to this policy.</li>
    </ul>
    <p>We do not sell your personal data.</p>

    <h3 id="calendar">Calendar integrations</h3>
    <p>If you choose to connect a Google or Microsoft 365 calendar, we use it only to keep your schedule in sync. You can disconnect at any time, or use a calendar subscription link instead.</p>
    <ul>
      <li><b>What we write:</b> a separate calendar called “Gala Dock” in your account, containing your Gala Dock events and tickets (name, time and location). We don’t change your other calendars.</li>
      <li><b>What we read:</b> only when you’re busy (start and end times), so we can show your availability. We don’t read the titles, attendees, descriptions or contents of your other events.</li>
      <li><b>What we store:</b> the email address of the connected account, your busy time ranges, and the access tokens. The tokens are encrypted (AES-256-GCM) and can’t be read by any part of the app you or other members use.</li>
      <li><b>Permissions requested:</b> Google: access to calendars the app creates (<code>calendar.app.created</code>) and free/busy information (<code>calendar.freebusy</code>). Microsoft: <code>Calendars.ReadWrite</code>.</li>
      <li><b>Retention:</b> deleted when you disconnect the calendar or delete your Gala Dock account.</li>
    </ul>
    <p>{LEGAL.service}’s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank">Google API Services User Data Policy</a>, including the Limited Use requirements. We use Google user data only to provide calendar sync, we don’t sell it or use it for advertising, we don’t use it to train AI models, and we don’t share it with anyone except as needed to provide the sync, to comply with the law, or with your permission. People at Gala Dock don’t read it unless you ask us to, for security, or where the law requires.</p>

    <h2 id="transfers">6. International transfers</h2>
    <p>Some of our service providers process data outside the UK, including in the United States. Where they do, we rely on UK adequacy regulations (including the UK Extension to the EU–US Data Privacy Framework, where the provider is certified), or the ICO’s International Data Transfer Agreement or Addendum together with a transfer risk assessment.</p>

    <h2 id="staff-access">7. Access to your messages by Gala Dock staff</h2>
    <p>Your conversations are private, and our staff cannot browse them. In limited cases authorised staff may review specific conversations linked to an open support or trust and safety case:</p>
    <ul>
      <li>to protect someone’s safety;</li>
      <li>to investigate fraud or abuse;</li>
      <li>to resolve a payment dispute;</li>
      <li>to respond to a legal request; or</li>
      <li>for a critical support issue.</li>
    </ul>
    <p>When this happens:</p>
    <ul>
      <li>access is read-only and time-limited;</li>
      <li>it requires a recorded reason and fresh identity verification;</li>
      <li>high-risk access needs approval from a second administrator where one is available;</li>
      <li>every conversation opened is logged and reviewed by our DPO;</li>
      <li>staff can never send, edit or delete messages as you.</li>
    </ul>
    <p>Where it is lawful and would not prejudice a fraud, safety or legal investigation, we will tell you afterwards that a review took place.</p>

    <h2 id="retention">8. How long we keep data</h2>
    <p>We keep personal data only as long as we need it for the purposes above or to meet legal requirements; then we delete or anonymise it. Retention periods are listed in our <Link href="/data-retention">Data Retention Schedule</Link>. Examples:</p>
    <ul>
      <li>Financial records: 6 years after the end of the financial year they relate to.</li>
      <li>Records of staff access to messages: 6 years.</li>
    </ul>

    <h2 id="rights">9. Your rights</h2>
    <p>You have the right to:</p>
    <ul>
      <li>access your data;</li>
      <li>correct it;</li>
      <li>have it erased;</li>
      <li>restrict or object to its processing, including to marketing at any time;</li>
      <li>receive a copy in a portable format; and</li>
      <li>withdraw consent where we rely on it.</li>
    </ul>
    <p>Some rights are limited where we must keep data by law or to defend legal claims.</p>
    <p>Contact <a href={`mailto:${contact.privacy}`}>{contact.privacy}</a> to use these rights. We will reply within one month, or tell you if we need up to two more months for a complex request.</p>

    <h2 id="security">10. Security</h2>
    <p>We protect data with:</p>
    <ul>
      <li>encryption in transit;</li>
      <li>database access controls that limit each account to its own data;</li>
      <li>two-step verification for all staff administrators, with fresh verification for sensitive actions;</li>
      <li>audit logging; and</li>
      <li>regular reviews of access.</li>
    </ul>
    <p>If a personal data breach puts your rights at risk, we will tell you and the ICO as the law requires.</p>

    <h2 id="children">11. Children</h2>
    <p>Accounts are for people aged 18 or over. Tickets may be bought for younger attendees where the organiser allows it. The adult who buys the ticket is responsible for the information they give about the attendee.</p>

    <h2 id="complaints">12. Complaints</h2>
    <p>Please contact our DPO first so we can try to put things right. You also have the right to complain to the {ico.name}: <a href={ico.url}>{ico.url.replace("https://", "")}</a>, telephone {ico.phone}.</p>

    <h2 id="changes">13. Changes to this policy</h2>
    <p>We will post updates here and change the version date. We will tell you before any significant change takes effect.</p>
  </article>;
}
