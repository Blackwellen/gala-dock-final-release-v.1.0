import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/messaging/queries";
import { EventCommsClient } from "./EventCommsClient";

export const dynamic = "force-dynamic";

export default async function CommsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const conversations = await listConversations(workspaceId, user.id, { tab: "all", eventId });

  return <EventCommsClient eventId={event.id} eventName={event.name} conversations={conversations} />;
}
