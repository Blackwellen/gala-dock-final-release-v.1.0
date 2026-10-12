import { redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpIndex, SupportPanel } from "@/components/help/help-centre";
import { getProvider } from "@/lib/provider/context";

export const metadata = { title: "Help Centre" };

/** Help Centre inside the Provider workspace shell: the same guides as /help, with Providers guides first and a contact form tied to this workspace. */
export default async function Help({ searchParams }: PageProps<"/provider/help">) {
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : null;
  if (topic) { const a = article(topic); redirect(a ? `/provider/help/${a.slug}` : "/provider/help"); }
  const wsId = (await getProvider()).workspace.id;
  return <HelpIndex base="/provider/help" first="Providers" q={typeof sp.q === "string" ? sp.q : ""} contact={<SupportPanel workspaceId={wsId} source="Provider workspace" />} />;
}
