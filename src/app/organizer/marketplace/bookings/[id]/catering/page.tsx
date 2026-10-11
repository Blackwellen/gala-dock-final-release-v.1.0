import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { CateringPage } from "@/components/venue/catering-page";

export const metadata = { title: "Catering" };

export default async function OrganizerCateringPage({ params }: PageProps<"/organizer/marketplace/bookings/[id]/catering">) {
  const { id } = await params;
  const ctx = await getOrganizer(`/organizer/marketplace/bookings/${id}/catering`);
  return <div className="k-col" style={{ gap: 14 }}>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace", href: "/organizer/marketplace" }, { label: "Booking", href: `/organizer/marketplace/bookings/${id}` }, { label: "Catering" }]} />
    <CateringPage client={ctx.supabase} itemId={id} />
  </div>;
}
