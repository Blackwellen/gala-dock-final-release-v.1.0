import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL } from "@/lib/legal";
import { legalDoc, statusLine } from "@/lib/legal/registry";
import { LEGAL_TEXTS } from "@/lib/legal/texts.generated";
import { loadPublished } from "@/lib/legal/published";
import { LegalMarkdown } from "./legal-markdown";

/** Previous published versions kept for reference (business users stay on them until the new version applies to them). */
const ARCHIVE: Record<string, { href: string; label: string }> = {
  terms: { href: "/legal/archive/terms-2026-10", label: "2026-10" },
  privacy: { href: "/legal/archive/privacy-2026-10", label: "2026-10" },
  "ticket-terms": { href: "/legal/archive/ticket-terms-2026-10", label: "2026-10" },
  cookies: { href: "/legal/archive/cookies-2026-10", label: "2026-10" },
  "data-retention": { href: "/legal/archive/data-retention-2026-10", label: "2026-10" },
};

export function legalMetadata(slug: string): Metadata {
  const doc = legalDoc(slug), text = LEGAL_TEXTS[slug];
  if (!doc || !text) return {};
  return { title: `${doc.title} · Gala Dock`, description: text.summary, alternates: { canonical: doc.href } };
}

/** The operator's identity block (Companies Act 2006 s.82 / trading disclosures): company, number, registered office, VAT and a contact
 *  route. Mirrors Gigvora: the company is the contracting party, and no individual is named in any legal header or contact point. */
export function LegalIdentity() {
  const e = LEGAL.entity;
  return <p className="lg-id">{e.name}, trading as {LEGAL.service} · registered in England and Wales, company number {e.number} · registered office {e.address} · VAT {e.vat} · <a href={`mailto:${LEGAL.contact.legal}`}>{LEGAL.contact.legal}</a></p>;
}

export async function LegalDocument({ slug }: { slug: string }) {
  const doc = legalDoc(slug), text = LEGAL_TEXTS[slug];
  if (!doc || !text) notFound();
  const published = await loadPublished();
  const prev = ARCHIVE[slug];
  return <article data-legal-slug={slug} data-legal-version={doc.version}>
    <p className="lg-eyebrow">Legal</p>
    <h1>{doc.title}</h1>
    <p className="lg-summary">{text.summary}</p>
    <p className="lg-meta"><span className="lg-ver">Version {doc.label}</span> {statusLine(doc, published[slug])}
      {prev && <> · <Link href={prev.href}>Previous version ({prev.label})</Link></>}</p>
    <LegalIdentity />
    <LegalMarkdown source={text.body} />
  </article>;
}
