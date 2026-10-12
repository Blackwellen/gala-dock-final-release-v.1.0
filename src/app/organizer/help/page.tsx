import { redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpIndex, SupportPanel } from "@/components/help/help-centre";
import { getOrganizer } from "@/lib/data/context";

export const metadata = { title: "Help Centre" };

/** Help Centre inside the Organizer workspace shell: the same guides as /help, with Organizers guides first and a contact form tied to this workspace. */
export default async function Help({ searchParams }: PageProps<"/organizer/help">) {
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : null;
  if (topic) { const a = article(topic); redirect(a ? `/organizer/help/${a.slug}` : "/organizer/help"); }
  const wsId = (await getOrganizer("/organizer/help")).workspace.id;
  return <HelpIndex base="/organizer/help" first="Organizers" q={typeof sp.q === "string" ? sp.q : ""} contact={<SupportPanel workspaceId={wsId} source="Organizer workspace" />} />;
}
