import { ArrowRight, FileSpreadsheet, Mail, MessagesSquare, ReceiptText, Ticket } from "lucide-react";
import { HREF, pageMetadata } from "@/lib/public/site";
import { siteUrl } from "@/lib/site-url";
import { LEGAL } from "@/lib/legal";
import { TLink } from "@/components/site/tracked-link";
import { Scope } from "@/components/site/motion";
import { Eyebrow, JsonLd, vars } from "@/components/site/ui";
import { Network } from "@/components/site/about/network";
import "@/styles/site-about.css";

export const metadata = pageMetadata({
  path: "/about",
  title: "About Gala Dock",
  description: "Gala Dock is building the infrastructure that brings an event together — one connected network for the people who create, deliver and attend events. Built by Blackwellen Limited.",
});

const S = "about";
const PRINCIPLES: [string, string][] = [
  ["Event first", "Everything connects back to the event. Bookings, tickets, people and money are parts of one record, not separate systems that happen to share a name."],
  ["Marketplace with context", "Availability and reliability matter more than endless directories. A good match is one that fits the date, the place and the plan."],
  ["Powerful, not bloated", "Complex operations should not require complex navigation. Depth belongs where the work is, not in another menu."],
  ["Technology with control", "AI should act through permissions, approvals and auditability. People make the consequential decisions."],
];
const FRAGMENTS: [string, typeof Mail][] = [["Spreadsheet", FileSpreadsheet], ["Group chat", MessagesSquare], ["Ticket site", Ticket], ["Venue email", Mail], ["Supplier invoice", ReceiptText]];

export default function AboutPage() {
  const base = siteUrl();
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", "@id": `${base}/#organization`, name: "Gala Dock", legalName: LEGAL.entity.name, url: `${base}/`, logo: `${base}/icons/icon-192.png`, email: LEGAL.contact.support,
      address: { "@type": "PostalAddress", streetAddress: "61 Bridge Street", addressLocality: "Kington", addressRegion: "Herefordshire", postalCode: "HR5 3DJ", addressCountry: "GB" }, vatID: LEGAL.entity.vat }} />

    {/* 7.1 Hero */}
    <section className="gp-hero gpa-hero" aria-labelledby="about-title">
      <div className="gp-wrap gpa-hero-grid">
        <div>
          <Eyebrow>About Gala Dock</Eyebrow>
          <h1 id="about-title" className="gp-h1 gpa-clip">We’re building the infrastructure that <span className="gp-blue">brings an event together.</span></h1>
          <p className="gp-lead">Events are complex. The software around them shouldn’t be.</p>
          <p className="gpa-by">Gala Dock is built by {LEGAL.entity.name}, a company registered in England and Wales.</p>
        </div>
        <Scope className="gpa-fine" amount={0.2} aria-hidden="true">
          <svg viewBox="0 0 400 320">
            {[[200, 160, 70, 60], [200, 160, 330, 70], [200, 160, 80, 260], [200, 160, 320, 250]].map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} className="gp-draw" pathLength={1} style={vars({ "--d": 300 + i * 400 })} />)}
            <circle cx="200" cy="160" r="96" className="gpa-ring gp-draw" pathLength={1} style={vars({ "--d": 1800 })} />
            <circle cx="200" cy="160" r="30" className="gpa-core" />
            {[[70, 60], [330, 70], [80, 260], [320, 250]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="9" className="gpa-dot" />)}
            <text x="200" y="165" textAnchor="middle">EVENT</text>
            {[["Venue", 70, 40], ["Provider", 330, 50], ["Guests", 80, 290], ["Organiser", 320, 280]].map(([t, x, y]) => <text key={t as string} x={x as number} y={y as number} textAnchor="middle" className="gpa-lbl">{t}</text>)}
          </svg>
        </Scope>
      </div>
    </section>

    {/* 7.2 Why Gala Dock Exists */}
    <section className="gp-sec is-tint gpa-why" aria-labelledby="about-why">
      <div className="gp-wrap gpa-why-grid">
        <div>
          <Eyebrow>The problem</Eyebrow>
          <h2 id="about-why" className="gp-h2 gpa-why-h">Planning an event still means stitching together venues, suppliers, spreadsheets, ticketing systems, messages and payments.</h2>
          <p className="gp-lead">Each piece lives somewhere different, so nobody sees the whole event. Gala Dock starts from the opposite end: one event record that every booking, ticket, person and payment belongs to.</p>
        </div>
        <Scope className="gpa-frag" amount={0.35}>
          <ul aria-label="Where event information usually lives">{FRAGMENTS.map(([t, I], i) => <li key={t} className={`is-${i}`} data-rv="fade" style={vars({ "--d": i * 90 })}><I size={18} aria-hidden="true" />{t}</li>)}</ul>
          <span className="gpa-frag-arrow" aria-hidden="true" />
          <p className="gpa-frag-result" data-rv="pop" style={vars({ "--d": 900 })}><b>One event record</b><span>Gala Dock</span></p>
        </Scope>
      </div>
    </section>

    {/* 7.3 Our Principles */}
    <section className="gp-sec gpa-princ" aria-labelledby="about-princ">
      <div className="gp-wrap">
        <header className="gpa-princ-h"><Eyebrow>How we build</Eyebrow><h2 id="about-princ" className="gp-h2">A platform should make complex event operations <span className="gp-blue">feel coherent.</span></h2></header>
        <Scope as="ol" className="gpa-princ-list" amount={0.15}>
          {PRINCIPLES.map(([t, d], i) => <li key={t} className={`is-${i}`}><span className="gpa-rule" data-rv="fade" style={vars({ "--d": i * 120 })} /><h3>{t}</h3><p>{d}</p></li>)}
        </Scope>
      </div>
    </section>

    {/* 7.4 Building the Event Network */}
    <section className="gp-sec is-tint gpa-network" aria-labelledby="about-net">
      <div className="gp-wrap">
        <header className="gp-head is-center"><Eyebrow center>The network</Eyebrow><h2 id="about-net" className="gp-h2">One connected network for the people who <span className="gp-blue">create, deliver and attend events.</span></h2></header>
        <Network />
        <div className="gpa-cta">
          <TLink href="/" surface={S} variant="explore" className="gp-btn gp-btn--primary">Explore Gala Dock<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
          <p className="gpa-links"><TLink href="/build-an-event" surface={S} variant="build" className="gp-link">Build an event</TLink><TLink href="/organisers" surface={S} variant="organisers" className="gp-link">For organisers</TLink><TLink href="/providers" surface={S} variant="providers" className="gp-link">For providers</TLink><TLink href={HREF.contact} surface={S} variant="contact" className="gp-link">Contact us</TLink><TLink href="/terms" surface={S} variant="legal" className="gp-link">Legal</TLink></p>
        </div>
        <dl className="gpa-company">
          <div><dt>Company</dt><dd>{LEGAL.entity.name}</dd></div>
          <div><dt>Registered in</dt><dd>England and Wales · company number {LEGAL.entity.number}</dd></div>
          <div><dt>Registered office</dt><dd>{LEGAL.entity.address}</dd></div>
          <div><dt>Contact</dt><dd><a href={`mailto:${LEGAL.contact.support}`}>{LEGAL.contact.support}</a></dd></div>
        </dl>
      </div>
    </section>
  </>;
}
