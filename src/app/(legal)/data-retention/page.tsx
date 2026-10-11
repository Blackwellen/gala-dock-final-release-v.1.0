import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Data Retention Schedule · Gala Dock", description: "How long Gala Dock keeps each type of personal data, and the legal basis for each period." };

const ROWS: [string, string, string][] = [
  ["Account and profile", "While your account is open; deleted or anonymised within 30 days of closure, except data kept for the purposes below", "UK GDPR Art. 5(1)(e) storage limitation"],
  ["Orders, payments, refunds, payouts, invoices and ledger entries", "6 years after the end of the financial year they relate to", "Companies Act 2006 s.386–388; HMRC record-keeping (including VAT Act 1994 Sch. 11 para. 6)"],
  ["Bookings, quotes, contracts and their saved terms", "6 years after the booking or event ends", "Limitation Act 1980 s.5 (contract claims)"],
  ["Tickets, transfers, resale records and check-ins", "6 years after the event", "Limitation Act 1980 s.5; financial record-keeping"],
  ["Disputes, chargebacks, support and trust and safety cases", "6 years after the case closes", "Limitation Act 1980; establishing or defending legal claims (UK GDPR Art. 17(3)(e))"],
  ["Records of staff access to messages (break-glass grants, access logs and their audit entries)", "6 years after the access grant ends, then deleted automatically", "Limitation Act 1980 s.5; UK GDPR Art. 5(2) accountability"],
  ["Other administrative audit logs", "6 years", "UK GDPR Art. 5(2) accountability; legal claims"],
  ["Messages and conversations", "While the account or workspace is active; deleted within 12 months of closure unless they are needed for an open case or legal claim", "Storage limitation; legal claims"],
  ["Provider verification, credentials and insurance documents", "While the listing is active and 6 years after", "Legal claims; consumer safety"],
  ["Marketing consent records", "While consent applies and 2 years after withdrawal", "PECR and UK GDPR Art. 7(1) (demonstrating consent)"],
  ["Security and sign-in logs", "12 months", "Security of processing (UK GDPR Art. 32)"],
  ["Gala Agent requests and actions", "12 months, or longer when linked to a booking or approval record kept under another row", "Storage limitation; accountability for approved actions"],
];

export default function DataRetention() {
  return <article>
    <h1>Data Retention Schedule</h1>
    <p className="lg-meta">Version {LEGAL.version} · effective {LEGAL.effective} · approved by {LEGAL.dpo.name}, {LEGAL.dpo.role}</p>
    <p>We keep personal data only as long as the law requires or allows. At the end of each period, data is deleted or irreversibly anonymised. If litigation, an investigation or a regulator requires it, we may keep specific records longer until the matter ends.</p>
    <table><thead><tr><th>Data</th><th>Kept for</th><th>Legal basis</th></tr></thead>
      <tbody>{ROWS.map(([d, k, b]) => <tr key={d}><td>{d}</td><td>{k}</td><td>{b}</td></tr>)}</tbody></table>
    <p>Questions: <a href={`mailto:${LEGAL.contact.privacy}`}>{LEGAL.contact.privacy}</a>. See also our <Link href="/privacy">Privacy Policy</Link>.</p>
  </article>;
}
