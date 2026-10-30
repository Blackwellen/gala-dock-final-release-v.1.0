import Link from "next/link";
import { GalaLogo } from "@/components/brand/gala-logo";
import { LEGAL } from "@/lib/legal";

/** Footer for public directory pages (events, cities, categories, calendar, series, landing pages). Only routes that exist. */
const COLS: { t: string; l: [string, string][] }[] = [
  { t: "Explore", l: [["/events", "Events"], ["/events/calendar", "Calendar"], ["/events/calendar?range=weekend", "This weekend"], ["/plan", "Plan an event"]] },
  { t: "For business", l: [["/register?intent=organizer", "For organizers"], ["/register?intent=provider", "List your business"], ["/#pricing", "Pricing"]] },
  { t: "Support", l: [["/help", "Help Centre"], ["/help#contact", "Contact"], ["/help/security-mfa", "Security"]] },
  { t: "Legal", l: [["/terms", "Terms"], ["/privacy", "Privacy"], ["/cookies", "Cookies"], ["/ticket-terms", "Ticket terms"]] },
];

export function SiteFooter() {
  return <footer className="dir-footer">
    <div className="dir-footer-top">
      <div className="dir-footer-brand"><GalaLogo className="gd-keep-word" /><p>Events. People. Places. Together.</p></div>
      <nav aria-label="Footer">{COLS.map(c => <div key={c.t}><h2>{c.t}</h2><ul>{c.l.map(([h, l]) => <li key={l}><Link href={h}>{l}</Link></li>)}</ul></div>)}</nav>
    </div>
    <p className="dir-footer-legal">© {new Date().getFullYear()} Gala Dock. Gala Dock is a trading name of {LEGAL.entity.name}, registered in England and Wales (company number {LEGAL.entity.number}).</p>
  </footer>;
}
