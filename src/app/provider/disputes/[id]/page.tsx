import { getProvider } from "@/lib/provider/context";
import { PageHeader } from "@/components/workspace/kit";
import { DisputeView } from "@/components/marketplace/dispute-view";

export const metadata = { title: "Dispute" };

export default async function ProviderDisputePage({ params }: PageProps<"/provider/disputes/[id]">) {
  const { id } = await params;
  const ctx = await getProvider();
  return <>
    <PageHeader title="Dispute" back={{ href: "/provider/bookings", label: "Bookings" }} />
    <DisputeView client={ctx.db} id={id} viewer="provider" bookingHref={item => `/provider/opportunities/${item}`} />
  </>;
}
