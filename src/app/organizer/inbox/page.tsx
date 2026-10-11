import { getOrganizer } from "@/lib/data/context";
import { Inbox } from "@/components/messaging/inbox";

export const metadata = { title: "Messages" };

/** Organizer inbox: the workspace seat — teammates share supplier, client, promoter and team conversations. */
export default async function OrganizerInboxPage({ searchParams }: PageProps<"/organizer/inbox">) {
  const sp = await searchParams;
  const ctx = await getOrganizer("/organizer/inbox");
  return <Inbox seat={ctx.workspace.id} base="/organizer/inbox" selected={typeof sp.c === "string" ? sp.c : undefined} />;
}
