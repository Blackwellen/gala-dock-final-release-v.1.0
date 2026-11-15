import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL_DOCUMENTS, LEGAL_GROUPS, LEGAL_PACK_LABEL, statusLine } from "@/lib/legal/registry";
import { LEGAL_TEXTS } from "@/lib/legal/texts.generated";
import { loadPublished } from "@/lib/legal/published";
import { LegalIdentity } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: "Legal documents · Gala Dock", description: "Every Gala Dock legal document with its version and the date it applies from.", alternates: { canonical: "/legal" } };

export default async function LegalIndex() {
  const published = await loadPublished();
  return <article>
    <p className="lg-eyebrow">Legal</p>
    <h1>Legal documents</h1>
    <p className="lg-summary">The agreements and policies that apply when you use Gala Dock. Each shows its version and the date it applies from. Business users get at least 15 days&apos; notice of changes.</p>
    <p className="lg-meta"><span className="lg-ver">Legal pack {LEGAL_PACK_LABEL}</span> Published legal texts are never edited in place; changes are made by publishing a new version.</p>
    <LegalIdentity />
    {LEGAL_GROUPS.map(g => <section key={g}>
      <h2 id={g.toLowerCase()}>{g}</h2>
      <ul className="lg-index">{LEGAL_DOCUMENTS.filter(d => d.group === g).map(d => <li key={d.slug}>
        <Link href={d.href}><b>{d.title}</b></Link>
        <small>Version {d.label} · {statusLine(d, published[d.slug])}</small>
        <span>{LEGAL_TEXTS[d.slug]?.summary}</span>
      </li>)}</ul>
    </section>)}
  </article>;
}
