import Link from "next/link";
import { getCustomer } from "@/lib/data/context";
import { CateringPage } from "@/components/venue/catering-page";

export const metadata = { title: "Catering" };

export default async function CustomerCateringPage({ params }: PageProps<"/account/events/[id]/bookings/[item]/catering">) {
  const { id, item } = await params;
  const ctx = await getCustomer(`/account/events/${id}/bookings/${item}/catering`);
  return <div className="k-col" style={{ gap: 14 }}>
    <Link className="k-link" href={`/account/events/${id}/bookings/${item}`}>Back to booking</Link>
    <CateringPage client={ctx.supabase} itemId={item} eventId={id} />
  </div>;
}
