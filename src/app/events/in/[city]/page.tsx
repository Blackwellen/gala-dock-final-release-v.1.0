import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryView } from "@/components/public/directory-view";
import { loadDirectory } from "@/lib/public/directory-page";
import { cityLabel } from "@/lib/public/directory";

const KEY = /^[a-z0-9][a-z0-9 -]{0,60}$/;
const norm = (s: string) => decodeURIComponent(s).trim().toLowerCase();

export async function generateMetadata({ params }: PageProps<"/events/in/[city]">): Promise<Metadata> {
  const key = norm((await params).city); if (!KEY.test(key)) return { title: "Events", robots: { index: false } };
  const name = cityLabel(key);
  return { title: `Events in ${name}`, description: `Upcoming public events in ${name}: music, nightlife, food and drink, culture and more on Gala Dock.`,
    alternates: { canonical: `/events/in/${encodeURIComponent(key)}` }, openGraph: { title: `Events in ${name} · Gala Dock`, url: `/events/in/${encodeURIComponent(key)}`, type: "website" } };
}

export default async function CityEvents({ params, searchParams }: PageProps<"/events/in/[city]">) {
  const key = norm((await params).city); if (!KEY.test(key)) notFound();
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const name = cityLabel(key);
  const props = await loadDirectory("city", key, sp, { heading: `${name} Events`, eyebrow: "Events in", place: `in ${name}`, basePath: `/events/in/${encodeURIComponent(key)}`,
    intro: `Discover the best public events in ${name} — music, nightlife, food and drink, culture and more.` });
  return <DirectoryView {...props} />;
}
