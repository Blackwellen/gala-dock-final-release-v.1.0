import Link from "next/link";
import { GalaLogo } from "@/components/brand/gala-logo";
import { LEGAL } from "@/lib/legal";
import { FOOTER_COLUMNS } from "@/lib/public/site";
import { TLink } from "@/components/site/tracked-link";
import "@/styles/public-site.css";

/** The one global public footer (blueprint §9.1): a compact navigation and trust surface on every public page. Only routes
 *  that exist; the company line comes from LEGAL (Companies House record). */
export function SiteFooter() {
  return <footer className="gp-footer dir-footer">
    <div className="gp-wrap">
      <div className="gp-footer-top">
        <div className="gp-footer-brand dir-footer-brand">
          <Link href="/" aria-label="Gala Dock home" className="gp-footer-logo"><GalaLogo className="gd-keep-word" /></Link>
          <p>Plan. Book. Sell. Promote. Run.<br />Everything for your event, connected.</p>
        </div>
        <nav className="gp-footer-cols" aria-label="Footer">
          {FOOTER_COLUMNS.map(c => <div key={c.title}>
            <h2>{c.title}</h2>
            <ul>{c.links.map(([href, label]) => <li key={label}><TLink href={href} event="footer_nav_click" surface="footer" variant={`${c.title}_${label}`}>{label}</TLink></li>)}</ul>
          </div>)}
        </nav>
      </div>
      <div className="gp-footer-bottom">
        <p>© {new Date().getFullYear()} Gala Dock. Gala Dock is a trading name of {LEGAL.entity.name}, registered in England and Wales (company number {LEGAL.entity.number}). Registered office: {LEGAL.entity.address}.</p>
        <p className="gp-footer-region">United Kingdom · GBP (£)</p>
      </div>
    </div>
  </footer>;
}
