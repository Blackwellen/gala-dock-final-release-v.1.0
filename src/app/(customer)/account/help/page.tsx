import { redirect } from "next/navigation";
import { article } from "@/lib/help/articles";
import { HelpIndex, SupportPanel } from "@/components/help/help-centre";


export const metadata = { title: "Help Centre" };

/** Help Centre inside the Customer account shell: the same guides as /help, with Customers guides first and a contact form tied to this workspace. */
export default async function Help({ searchParams }: PageProps<"/account/help">) {
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : null;
  if (topic) { const a = article(topic); redirect(a ? `/account/help/${a.slug}` : "/account/help"); }
  const wsId = null;
  return <HelpIndex base="/account/help" first="Customers" q={typeof sp.q === "string" ? sp.q : ""} contact={<SupportPanel workspaceId={wsId} source="Customer account" />} />;
}
