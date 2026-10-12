import { redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpIndex, SupportPanel } from "@/components/help/help-centre";

export const metadata = { title: "Help Centre · Gala Dock", description: "Guides for customers, organizers, providers and developers, and how to contact support." };

/** Public Help Centre index (release spec §84). `?topic=<slug>` (used across the app) redirects to the article. */
export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : null;
  if (topic) { const a = article(topic); redirect(a ? `/help/${a.slug}` : "/help"); }
  return <HelpIndex base="/help" q={typeof sp.q === "string" ? sp.q : ""} contact={<SupportPanel source="Help Centre" />} />;
}
