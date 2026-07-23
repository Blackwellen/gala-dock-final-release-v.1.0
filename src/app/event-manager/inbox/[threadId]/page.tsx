import { redirect } from "next/navigation";

/** Legacy route from the old log-only Inbox (one route per thread_id).
 * The rebuilt Inbox renders the selected conversation inline via
 * ?conversation= query state on the main page — redirect old/bookmarked
 * links there so they keep working. */
export default async function LegacyThreadRedirect({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  redirect(`/event-manager/inbox?conversation=${threadId}`);
}
