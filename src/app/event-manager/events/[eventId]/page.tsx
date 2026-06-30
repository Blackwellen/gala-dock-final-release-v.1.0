import { redirect } from "next/navigation";

export default async function EventRootPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  redirect(`/event-manager/events/${eventId}/overview`);
}
