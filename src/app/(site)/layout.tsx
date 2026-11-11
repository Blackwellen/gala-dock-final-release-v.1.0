import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import "@/styles/public-site.css";

/** The seven blueprint pages (/, /organisers, /providers, /build-an-event, /developers, /about, /pricing): one global header and
 *  footer, white canvas, one display scale. Each page owns its sections; nothing here is page-specific. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="gp-root">
    <a className="gp-skip" href="#main">Skip to content</a>
    <SiteHeader />
    <main id="main">{children}</main>
    <SiteFooter />
  </div>;
}
