import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { loadLifecycle } from "@/lib/marketplace/lifecycle";
import { LifecyclePanel } from "@/components/marketplace/lifecycle-panel";
import { money } from "@/lib/format";
import { requestTime } from "@/lib/workspace/format";
import { untyped } from "@/lib/workspace/db";
import { getHospitalityBooking } from "@/lib/venue/hospitality";
import { HospitalityPanel, type BarPackage } from "@/components/customer/hospitality-panel";

export const metadata = { title: "Booking" };

/** Customer view of one booking line (§33–45): holds, standby, cancellation with policy preview, disputes. */
export default async function CustomerBookingPage({ params }: PageProps<"/account/events/[id]/bookings/[item]">) {
  const { id, item: itemId } = await params;
  const ctx = await getCustomer(`/account/events/${id}/bookings/${itemId}`);
  const lc = await loadLifecycle(ctx.supabase, itemId);
  if (!lc || lc.event.id !== id) notFound();
  // Q13: catering and bar lines get the food & drink panel (structured selection, final numbers, allergens, bar package).
  const kind = lc.item.category === "food" ? "food" : lc.item.category === "drinks" ? "drinks" : null;
  let hosp: Parameters<typeof HospitalityPanel>[0] | null = null;
  if (kind) {
    const db = untyped(ctx.supabase);
    const [hb, { data: listing }, { data: ev }] = await Promise.all([getHospitalityBooking(itemId), lc.item.listing_id ? db.from("listings").select("workspace_id").eq("id", lc.item.listing_id).maybeSingle() : Promise.resolve({ data: null }), db.from("events").select("guest_count").eq("id", id).maybeSingle()]);
    const { data: bars } = kind === "drinks" && listing?.workspace_id ? await db.from("bar_packages").select("id,name,model,description,per_person,price,licensing").eq("workspace_id", listing.workspace_id).eq("status", "published").order("name") : { data: [] };
    hosp = { itemId, eventId: id, kind, now: requestTime(), booking: hb.ok ? hb.data : null, guests: Number(ev?.guest_count ?? 1) || 1,
      bars: ((bars ?? []) as { id: string; name: string; model: string; description: string; per_person: number | null; price: number | null; licensing: { min_age?: number } | null }[]).map(b => ({ id: b.id, name: b.name, model: b.model, description: b.description, per_person: b.per_person, price: b.price, min_age: b.licensing?.min_age ?? null })) as BarPackage[] };
  }
  return <div className="k-col" style={{ gap: 14, maxWidth: 760 }}>
    <Link className="k-link k-row" style={{ gap: 6 }} href={`/account/events/${id}/build`}><ArrowLeft size={14} aria-hidden="true" />Back to {lc.event.name}</Link>
    <header><h1 style={{ fontSize: 24, margin: 0 }}>{lc.item.title}</h1>
      <p className="k-muted" style={{ margin: "4px 0 0" }}>{lc.listing?.name ?? lc.item.category}{lc.item.amount != null ? ` · ${money(lc.item.amount)}` : ""}</p></header>
    {hosp && <HospitalityPanel {...hosp} />}
    <LifecyclePanel itemId={itemId} viewer="customer" quiet={false} />
  </div>;
}
