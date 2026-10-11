import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { TicketScanner } from "@/components/tickets/scanner";

export const metadata = { title: "Check-in" };

/** PWA check-in for organizer teams (§51). Event access is enforced again by every scan on the server. */
export default async function OrganizerScanPage({ params }: PageProps<"/organizer/events/[id]/scan">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(`/organizer/events/${id}/scan`);
  const { data: e } = await ctx.supabase.from("events").select("id,name,workspace_id").eq("id", id).maybeSingle();
  if (!e || e.workspace_id !== ctx.workspace.id) notFound();
  return <div className="k-col" style={{ gap: 14 }}>
    <Crumbs items={[{ label: "Events", href: "/organizer/events" }, { label: e.name, href: `/organizer/events/${id}` }, { label: "Check-in" }]} />
    <TicketScanner eventId={id} eventName={e.name} />
  </div>;
}
