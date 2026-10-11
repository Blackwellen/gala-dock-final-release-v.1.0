import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/data/context";
import { loadTicketSetup } from "@/lib/data/ticket-setup";
import { TicketSetup } from "@/components/shared/ticket-setup";

export const metadata = { title: "Ticket setup" };

export default async function CustomerTicketSetup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadTicketSetup(ctx.supabase, id); if (!data || data.event.management !== "consumer") notFound();
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1)) as 1 | 2 | 3;
  return <TicketSetup mode="customer" step={step} data={data} base={`/account/events/${id}/tickets/setup`} back={`/account/events/${id}/guests-tickets`} crumbs={[["My Events", "/account/events"], [data.event.name, `/account/events/${id}`], ["Ticket Setup", ""]]} />;
}
