import { notFound, permanentRedirect } from "next/navigation";
import { LegalDocument, legalMetadata } from "@/components/legal/legal-document";
import { LEGAL_DOCUMENTS, isShortUrl, legalDoc } from "@/lib/legal/registry";

export const dynamicParams = false;
export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map(d => ({ slug: d.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return legalMetadata((await params).slug);
}

/** Every legal document at /legal/<slug>; the six with a short URL (/terms, /privacy …) redirect there. */
export default async function LegalSlugPage({ params }: Props) {
  const { slug } = await params;
  const doc = legalDoc(slug);
  if (!doc) notFound();
  if (isShortUrl(doc)) permanentRedirect(doc.href);
  return <LegalDocument slug={slug} />;
}
