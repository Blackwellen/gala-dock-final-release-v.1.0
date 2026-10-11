import { getCustomer } from "@/lib/data/context";
import { DisputeView } from "@/components/marketplace/dispute-view";

export const metadata = { title: "Dispute" };

export default async function CustomerDisputePage({ params }: PageProps<"/account/disputes/[id]">) {
  const { id } = await params;
  const ctx = await getCustomer(`/account/disputes/${id}`);
  return <DisputeView client={ctx.supabase} id={id} viewer="customer" bookingHref={(item, event) => `/account/events/${event}/bookings/${item}`} />;
}
