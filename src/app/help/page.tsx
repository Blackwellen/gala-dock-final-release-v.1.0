import { redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpIndex, SupportPanel } from "@/components/help/help-centre";
import { helpContext, helpFrom } from "@/lib/help/context";

export const metadata = { title: "Help Centre · Gala Dock", description: "Guides for customers, organizers, providers and developers, and how to contact support." };

/** The one Help Centre (release spec §84; owner 2026-10-29: one main help centre, signed in or out). Workspace help routes redirect
 *  here with `?from=`. `?topic=<slug>` (used across the app) redirects to the article. */
export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : null;
  if (topic) { const a = article(topic); redirect(a ? `/help/${a.slug}` : "/help"); }
  const ctx = await helpContext(helpFrom(sp.from));
  return <HelpIndex base="/help" first={ctx.first} q={typeof sp.q === "string" ? sp.q : ""} contact={<SupportPanel workspaceId={ctx.workspaceId} source={ctx.source} />} />;
}
