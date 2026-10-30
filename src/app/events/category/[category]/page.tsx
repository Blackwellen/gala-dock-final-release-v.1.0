import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryView } from "@/components/public/directory-view";
import { loadDirectory } from "@/lib/public/directory-page";
import { eventTypeLabel } from "@/lib/format";

const KEY = /^[a-z0-9_]{2,40}$/;

export async function generateMetadata({ params }: PageProps<"/events/category/[category]">): Promise<Metadata> {
  const key = decodeURIComponent((await params).category).toLowerCase(); if (!KEY.test(key)) return { title: "Events", robots: { index: false } };
  const name = eventTypeLabel(key);
  return { title: `${name} events`, description: `Upcoming public ${name.toLowerCase()} events on Gala Dock.`,
    alternates: { canonical: `/events/category/${key}` }, openGraph: { title: `${name} events · Gala Dock`, url: `/events/category/${key}`, type: "website" } };
}

export default async function CategoryEvents({ params, searchParams }: PageProps<"/events/category/[category]">) {
  const key = decodeURIComponent((await params).category).toLowerCase(); if (!KEY.test(key)) notFound();
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const name = eventTypeLabel(key);
  const props = await loadDirectory("category", key, sp, { heading: `${name} events`, eyebrow: "Event type", place: "", basePath: `/events/category/${key}`,
    intro: `Upcoming public ${name.toLowerCase()} events, soonest first.` });
  return <DirectoryView {...props} />;
}
