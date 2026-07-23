import { EventExtensionShell } from "@/components/events/EventExtensionShell";

export default async function EventExtensionPage({
  params,
}: {
  params: Promise<{ eventId: string; extension: string[] }>;
}) {
  const { eventId, extension } = await params;
  return <EventExtensionShell eventId={eventId} extensionId={extension[0] ?? ""} />;
}
