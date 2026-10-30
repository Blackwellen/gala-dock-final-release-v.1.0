import type { Metadata } from "next";
import { PublicListing, loadListing } from "@/components/customer/public-listing";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const { l } = await loadListing("venue", slug);
  return l ? { title: l.name, description: l.description?.slice(0, 160), alternates: { canonical: `/venues/${l.slug ?? slug}` }, openGraph: { title: l.name, description: l.description?.slice(0, 160), url: `/venues/${l.slug ?? slug}`, type: "website", images: l.image ? [l.image] : [] } } : { title: "Not found" };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicListing kind="venue" slug={slug} />;
}
