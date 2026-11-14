import type { Metadata } from "next";
import { PublicListing, loadListing } from "@/components/customer/public-listing";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { slug } = await params; const preview = (await searchParams).preview === "1"; const { l } = await loadListing("service", slug, preview);
  // Q62: an unpublished preview is never indexed; a missing listing says so to crawlers too.
  if (l && !(l as { published?: boolean }).published) return { title: `Preview: ${l.name}`, robots: { index: false, follow: false } };
  return l ? { title: l.name, description: l.description?.slice(0, 160), alternates: { canonical: `/services/${l.slug ?? slug}` }, openGraph: { title: l.name, description: l.description?.slice(0, 160), url: `/services/${l.slug ?? slug}`, type: "website", images: l.image ? [l.image] : [] } } : { title: "Not found", robots: { index: false } };
}
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  return <PublicListing kind="service" slug={slug} preview={(await searchParams).preview === "1"} />;
}
