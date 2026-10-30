import { notFound, redirect } from "next/navigation";
import { untyped } from "@/lib/workspace/db";
import { getCustomer } from "@/lib/data/context";
import { loadTicketSetup } from "@/lib/data/ticket-setup";
import { TicketSetup } from "@/components/shared/ticket-setup";

export const metadata = { title: "Ticket setup" };

export default async function CustomerTicketSetup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); const ctx = await getCustomer();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadTicketSetup(ctx.supabase, id); if (!data || data.event.management !== "consumer") notFound();
  // W11: ticket setup is only reachable once ticketing is on for optional-off / private-only types (switch on Guests & Tickets).
  const { data: pol } = await untyped(ctx.supabase).rpc("event_ticketing_policy", { p_event: id });
  const pp = pol as { allowed?: boolean; mode?: string; opted_in?: boolean; grandfathered?: boolean } | null;
  if (pp && (pp.allowed === false || ((pp.mode === "optional_off" || pp.mode === "private_only") && !pp.opted_in && !pp.grandfathered))) redirect(`/account/events/${id}/guests-tickets?tab=tickets`);
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1)) as 1 | 2 | 3;
  return <TicketSetup mode="customer" step={step} data={data} base={`/account/events/${id}/tickets/setup`} back={`/account/events/${id}/guests-tickets`} crumbs={[["My Events", "/account/events"], [data.event.name, `/account/events/${id}`], ["Ticket Setup", ""]]} />;
}
