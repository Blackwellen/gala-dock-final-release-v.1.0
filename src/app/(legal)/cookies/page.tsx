import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Cookie Policy · Gala Dock", description: "The cookies and similar storage Gala Dock uses, and why." };

const ROWS: [string, string, string, string][] = [
  ["sb-…-auth-token", "Strictly necessary", "Keeps you signed in securely (authentication session).", "Session, or up to 400 days if you choose “Remember this device”"],
  ["gd-remember", "Strictly necessary", "Records whether to keep you signed in on this device.", "400 days"],
  ["gd_co_…", "Strictly necessary", "Links your checkout to the tickets or seats held for you.", "Until checkout ends (short-lived)"],
  ["gd_ref", "Functional (referral)", "Credits the promoter whose link you followed if you buy a ticket for that event.", "30 days"],
  ["gd-density (local storage)", "Preference", "Remembers your workspace display density.", "Until cleared"],
  ["gd-cal-views (local storage)", "Preference", "Remembers your saved calendar views.", "Until cleared"],
  ["gd_scan_device (local storage)", "Strictly necessary (staff only)", "Identifies a ticket-scanning device so offline check-ins reconcile correctly.", "Until cleared"],
];

export default function Cookies() {
  return <article>
    <h1>Cookie Policy</h1>
    <p className="lg-meta">Version {LEGAL.version} · effective {LEGAL.effective}</p>
    <p>Cookies are small files your browser stores for a website. We use a small number of our own cookies, and similar local storage, to run {LEGAL.service}. We do not use advertising or cross-site tracking cookies. Under the Privacy and Electronic Communications Regulations 2003, cookies that are strictly necessary for a service you ask for do not need consent.</p>
    <table><thead><tr><th>Name</th><th>Type</th><th>Purpose</th><th>Lasts</th></tr></thead>
      <tbody>{ROWS.map(([n, t, p, d]) => <tr key={n}><td><code>{n}</code></td><td>{t}</td><td>{p}</td><td>{d}</td></tr>)}</tbody></table>
    <h2 id="third">Third-party services</h2>
    <p>Stripe’s checkout pages set their own cookies to process payments securely and prevent fraud. They are covered by Stripe’s cookie policy. Embedded maps may load content from the map provider.</p>
    <h2 id="control">Managing cookies</h2>
    <p>You can block or delete cookies in your browser settings. If you block strictly necessary cookies, you won’t be able to sign in or check out. See our <Link href="/privacy">Privacy Policy</Link> for how we use personal data.</p>
  </article>;
}
