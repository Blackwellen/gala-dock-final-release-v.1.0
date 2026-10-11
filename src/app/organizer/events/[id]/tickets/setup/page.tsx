import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { loadTicketSetup } from "@/lib/data/ticket-setup";
import { TicketSetup } from "@/components/shared/ticket-setup";

export const metadata = { title: "Ticket setup" };

export default async function OrganizerTicketSetup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getOrganizer();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadTicketSetup(ctx.supabase, id); if (!data || data.event.management !== "professional") notFound();
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1)) as 1 | 2 | 3;
  return <TicketSetup mode="organizer" step={step} data={data} base={`/organizer/events/${id}/tickets/setup`} back={`/organizer/events/${id}?tab=sell`} crumbs={[["Events", "/organizer/events"], [data.event.name, `/organizer/events/${id}`], ["Ticket Setup", ""]]} />;
}
