import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PublishForm } from "./PublishForm";

export const dynamic = "force-dynamic";

export default async function PublishEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: ev } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) notFound();

  const [pageRes, ticketsRes] = await Promise.all([
    supabase.from("event_public_pages").select("slug, published, headline, summary, starts_at, city").eq("workspace_id", workspaceId).eq("event_id", eventId).maybeSingle(),
    supabase.from("ticket_types").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_id", eventId),
  ]);
  const page = pageRes.data;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Publish" description="Make this event public, configure the public page and open ticket sales." />
      <div className="px-6 lg:px-8 pb-10">
        <PublishForm
          eventId={eventId}
          initial={{
            published: page?.published ?? false,
            headline: page?.headline ?? ev.name,
            summary: page?.summary ?? "",
            startsAt: page?.starts_at ? page.starts_at.slice(0, 10) : "",
            city: page?.city ?? "",
            slug: page?.slug ?? null,
            hasTickets: (ticketsRes.count ?? 0) > 0,
          }}
        />
      </div>
    </div>
  );
}
