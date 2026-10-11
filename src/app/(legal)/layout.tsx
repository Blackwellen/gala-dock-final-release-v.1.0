import Link from "next/link";
import type { ReactNode } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";
import { LEGAL, LEGAL_DOCS } from "@/lib/legal";
import "@/styles/legal.css";

/** Shared shell for the legal documents: the public header (same wrapper as the public event pages), a document index and a readable column. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root lg">
    <PublicHeader />
    <div className="lg-body">
      <nav className="lg-nav" aria-label="Legal documents"><b>Legal</b>
        <ul>{LEGAL_DOCS.map(d => <li key={d.href}><Link href={d.href}>{d.title}</Link></li>)}</ul>
        <p>Version {LEGAL.version} · effective {LEGAL.effective}</p></nav>
      <main className="lg-doc" id="main">{children}</main>
    </div>
  </div></KitProviders>;
}
