import Link from "next/link";
import type { ReactNode } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";
import { SiteFooter } from "@/components/public/site-footer";
import "@/styles/pub-directory.css";
import { LEGAL_NAV } from "@/lib/legal";
import { LEGAL_PACK_LABEL } from "@/lib/legal/registry";
import { LegalToc } from "@/components/legal/legal-toc";
import "@/styles/legal.css";

/** Shared shell for the legal documents: the public header (same wrapper as the public event pages), a document index and a readable column. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root lg">
    <PublicHeader />
    <div className="lg-body">
      <nav className="lg-nav" aria-label="Legal documents"><b><Link href="/legal">Legal</Link></b>
        {LEGAL_NAV.map(g => <details key={g.group} open={g.group === "General"}><summary>{g.group}</summary>
          <ul>{g.docs.map(d => <li key={d.href}><Link href={d.href}>{d.title}</Link></li>)}</ul></details>)}
        <p>Legal pack {LEGAL_PACK_LABEL} · <Link href="/legal">All documents and dates</Link></p></nav>
      <main className="lg-doc" id="main">{children}</main>
      <LegalToc />
    </div>
    <SiteFooter />
  </div></KitProviders>;
}
