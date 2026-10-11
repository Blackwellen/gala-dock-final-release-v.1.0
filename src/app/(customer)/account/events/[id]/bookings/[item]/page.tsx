import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { loadLifecycle } from "@/lib/marketplace/lifecycle";
import { LifecyclePanel } from "@/components/marketplace/lifecycle-panel";
import { money } from "@/lib/format";

export const metadata = { title: "Booking" };

/** Customer view of one booking line (§33–45): holds, standby, cancellation with policy preview, disputes. */
export default async function CustomerBookingPage({ params }: PageProps<"/account/events/[id]/bookings/[item]">) {
  const { id, item: itemId } = await params;
  const ctx = await getCustomer(`/account/events/${id}/bookings/${itemId}`);
  const lc = await loadLifecycle(ctx.supabase, itemId);
  if (!lc || lc.event.id !== id) notFound();
  return <div className="k-col" style={{ gap: 14, maxWidth: 760 }}>
    <Link className="k-link k-row" style={{ gap: 6 }} href={`/account/events/${id}/build`}><ArrowLeft size={14} aria-hidden="true" />Back to {lc.event.name}</Link>
    <header><h1 style={{ fontSize: 24, margin: 0 }}>{lc.item.title}</h1>
      <p className="k-muted" style={{ margin: "4px 0 0" }}>{lc.listing?.name ?? lc.item.category}{lc.item.amount != null ? ` · ${money(lc.item.amount)}` : ""}</p></header>
    <LifecyclePanel itemId={itemId} viewer="customer" quiet={false} />
  </div>;
}
