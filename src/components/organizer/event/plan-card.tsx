import Link from "next/link";
import { PenLine, Maximize2, MapPinned } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadEventPlan } from "@/lib/data/event-plan";
import { PlanPreview } from "@/components/venue-plan/plan-preview";
import { planSeats, planAreas } from "@/components/venue-plan/inventory";
import { num } from "@/lib/format";

type TierLite = { id: string; name: string; color?: string | null; sold: number; quantity: number };
const PALETTE = ["#5b5bff", "#a855f7", "#16a46c", "#e08a00", "#e0398b", "#0ea5c6"];

/** The event's real saved layout (not a generated placeholder) with per-tier seat/area allocation and a link into the editor. */
export async function EventPlanCard({ eventId, venueListingId, tiers, height = 180 }: { eventId: string; venueListingId?: string | null; tiers: TierLite[]; height?: number }) {
  const plan = await loadEventPlan(await createClient(), { id: eventId, venue_listing_id: venueListingId });
  const href = `/organizer/events/${eventId}/map`;
  const colors = Object.fromEntries(tiers.map((t, i) => [t.id, t.color || PALETTE[i % PALETTE.length]]));
  const has = plan.overlay.some(e => e.type !== "layer") || plan.base.length > 0;
  let seats: ReturnType<typeof planSeats> = []; try { seats = planSeats(plan.overlay); } catch { seats = []; }
  const alloc = new Map<string, number>();
  for (const s of seats) if (s.tier && !s.blocked) alloc.set(s.tier, (alloc.get(s.tier) ?? 0) + 1);
  for (const a of planAreas(plan.overlay)) if (a.tier) alloc.set(a.tier, (alloc.get(a.tier) ?? 0) + a.capacity);
  const shown = tiers.filter(t => alloc.has(t.id)).slice(0, 3);
  const status = plan.latest ? `v${plan.latest.version} · ${plan.latest.status === "published" ? "published" : "draft"}` : null;
  return <>
    <div className="sl-map">{has ? <PlanPreview base={plan.base} overlay={plan.overlay} spaces={plan.spaces} height={height} tierColor={colors} />
      : <div className="sl-map-empty" style={{ height }}><MapPinned size={22} aria-hidden="true" /><b>No layout yet</b><span>{plan.venueName ? `Build the layout for ${plan.venueName}` : "Build your site plan"}: stage, zones, seating and facilities.</span><Link className="k-btn primary sm" href={href}><PenLine size={13} />Build layout</Link></div>}
      {has && <div className="sl-map-tools"><Link href={href} className="k-icon-btn" aria-label="Open layout editor"><Maximize2 size={14} /></Link></div>}</div>
    {has && <div className="k-between" style={{ marginTop: 8 }}><span className="k-xs k-muted">{status ? `Layout ${status}` : "Venue plan only"}{seats.length ? ` · ${num(seats.filter(s => !s.blocked).length)} reserved seats` : ""}</span></div>}
    {shown.length > 0 && <div className="k-grid k-g3" style={{ gap: 8, marginTop: 8 }}>{shown.map(t => <div key={t.id} className="sl-zone"><i className="k-dot" style={{ background: colors[t.id] }} /><div><b className="k-small">{t.name}</b><div className="k-xs k-muted">{num(alloc.get(t.id) ?? 0)} on plan · {num(t.sold)} / {num(t.quantity)} sold</div></div></div>)}</div>}
  </>;
}
