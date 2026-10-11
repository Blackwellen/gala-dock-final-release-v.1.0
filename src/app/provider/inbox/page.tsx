import { getProvider } from "@/lib/provider/context";
import { Inbox } from "@/components/messaging/inbox";

export const metadata = { title: "Messages" };

/** Provider inbox: workspace seat for client enquiries and booking conversations (event threads stay under Messages). */
export default async function ProviderInboxPage({ searchParams }: PageProps<"/provider/inbox">) {
  const sp = await searchParams;
  const ctx = await getProvider();
  return <Inbox seat={ctx.workspace.id} base="/provider/inbox" selected={typeof sp.c === "string" ? sp.c : undefined} />;
}
