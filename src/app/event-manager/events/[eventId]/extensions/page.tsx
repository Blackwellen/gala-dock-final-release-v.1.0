import { EventExtensionsIndex } from "@/components/events/EventExtensionShell";

export default async function EventExtensionsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventExtensionsIndex eventId={eventId} />;
}
