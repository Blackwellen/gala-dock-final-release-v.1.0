import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import "@/styles/public-site.css";

/** App-wide 404 (unknown URLs and notFound() outside a layout with its own chrome): the global public header and footer and the
 *  public design system, with routes into the main public pages. */
const LINKS: [string, string][] = [["/events", "Browse events"], ["/build-an-event", "Build an event"], ["/organisers", "For organisers"], ["/providers", "For providers"], ["/pricing", "Pricing"], ["/help", "Help Centre"]];

export default function NotFound() {
  return <div className="gp-root">
    <SiteHeader />
    <main id="main" className="gp-404">
      <div className="gp-wrap">
        <header className="gp-head is-center">
          <p className="gp-eyebrow is-center">Error 404</p>
          <h1 className="gp-h1">Page not found</h1>
          <p className="gp-lead">The page you’re looking for doesn’t exist or has moved. These are good places to pick up from.</p>
        </header>
        <ul className="gp-404-links">{LINKS.map(([h, l]) => <li key={h}><Link href={h}>{l}<ArrowRight size={17} aria-hidden="true" /></Link></li>)}</ul>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
