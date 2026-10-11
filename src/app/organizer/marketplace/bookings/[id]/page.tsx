import Link from "next/link";
import { notFound } from "next/navigation";
import { Siren } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { loadLifecycle } from "@/lib/marketplace/lifecycle";
import { PageHead } from "@/components/kit";
import { LifecyclePanel } from "@/components/marketplace/lifecycle-panel";
import { ItemActions } from "@/components/organizer/event/controls";
import { money, dateShort } from "@/lib/format";

export const metadata = { title: "Booking" };

/** Organizer view of one marketplace booking line: response, holds, standby, cancellation and disputes. */
export default async function OrganizerBookingPage({ params }: PageProps<"/organizer/marketplace/bookings/[id]">) {
  const { id } = await params;
  const ctx = await getOrganizer();
  const lc = await loadLifecycle(ctx.supabase, id);
  if (!lc || lc.event.workspace_id !== ctx.workspace.id) notFound();
  const { item, event, listing } = lc;
  const failed = ["cancelled_by_provider", "replacement_required", "declined", "unavailable", "expired"].includes(item.status);
  return <div className="k-col" style={{ gap: 16 }}>
    <PageHead crumbs={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace", href: "/organizer/marketplace" },
      ...(item.request_id ? [{ label: "Request", href: `/organizer/marketplace/requests/${item.request_id}` }] : []), { label: item.title }]}
      title={item.title} sub={<>{listing?.name ?? item.category} · <Link className="k-link" href={`/organizer/events/${event.id}`}>{event.name}</Link> · {dateShort(event.starts_at)}{item.amount != null ? ` · ${money(item.amount)}` : ""}</>}
      actions={<>{["available", "quoted", "held", "suggested", "draft", "expired", "declined"].includes(item.status) && <ItemActions eventId={event.id} itemId={item.id} status={item.status} title={item.title} canConfirm={["owner", "manager"].includes(ctx.role)} />}{failed && <Link className="k-btn primary" href={`/organizer/marketplace/emergency?event=${event.id}&category=${encodeURIComponent(item.category)}&original=${item.id}`}><Siren size={15} aria-hidden="true" />Find emergency cover</Link>}</>} />
    <div style={{ maxWidth: 760 }}><LifecyclePanel itemId={item.id} viewer="organizer" quiet={false} /></div>
  </div>;
}
