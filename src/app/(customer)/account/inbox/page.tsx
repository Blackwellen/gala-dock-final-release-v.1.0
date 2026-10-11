import { getCustomer } from "@/lib/data/context";
import { Inbox } from "@/components/messaging/inbox";

export const metadata = { title: "Messages" };

/** Personal inbox (customers, promoters, team members speaking for themselves). */
export default async function AccountInboxPage({ searchParams }: PageProps<"/account/inbox">) {
  const sp = await searchParams;
  await getCustomer("/account/inbox");
  return <Inbox seat={null} base="/account/inbox" selected={typeof sp.c === "string" ? sp.c : undefined} />;
}
