import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { DisputeView } from "@/components/marketplace/dispute-view";

export const metadata = { title: "Dispute" };

export default async function OrganizerDisputePage({ params }: PageProps<"/organizer/disputes/[id]">) {
  const { id } = await params;
  const ctx = await getOrganizer(`/organizer/disputes/${id}`);
  return <div className="k-col" style={{ gap: 14 }}>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace", href: "/organizer/marketplace" }, { label: "Dispute" }]} />
    <DisputeView client={ctx.supabase} id={id} viewer="customer" bookingHref={item => `/organizer/marketplace/bookings/${item}`} />
  </div>;
}
