import type { Metadata } from "next";
import { DirectoryView } from "@/components/public/directory-view";
import { loadDirectory } from "@/lib/public/directory-page";

export const metadata: Metadata = {
  title: { absolute: "Events near you · Gala Dock" }, description: "Browse upcoming public events on Gala Dock — concerts, festivals, food, nightlife and more. Filter by date, city and type.",
  alternates: { canonical: "/events" }, openGraph: { title: "Events on Gala Dock", url: "/events", type: "website" },
};

export default async function EventsDirectory({ searchParams }: PageProps<"/events">) {
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const props = await loadDirectory("all", null, sp, { heading: "Upcoming events", eyebrow: "Events on Gala Dock", place: "near you", basePath: "/events",
    intro: "Discover concerts, festivals, food and drink, nightlife and more. Every event here is public, upcoming and bookable." });
  return <DirectoryView {...props} />;
}
