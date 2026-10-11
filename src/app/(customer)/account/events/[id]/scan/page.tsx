import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/data/context";
import { TicketScanner } from "@/components/tickets/scanner";

export const metadata = { title: "Check-in" };

export default async function CustomerScanPage({ params }: PageProps<"/account/events/[id]/scan">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getCustomer(`/account/events/${id}/scan`);
  const { data: e } = await ctx.supabase.from("events").select("id,name,owner_id").eq("id", id).maybeSingle();
  if (!e || e.owner_id !== ctx.user.id) notFound();
  return <TicketScanner eventId={id} eventName={e.name} />;
}
