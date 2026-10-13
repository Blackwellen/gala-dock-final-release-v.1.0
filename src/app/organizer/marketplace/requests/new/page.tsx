import { redirect } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { LISTING_COLS, fitFor, availabilityFor, type Listing, type EventCtx } from "@/lib/data/marketplace";
import { WizardFrame } from "@/components/organizer/wizard";
import { RfqStep1, RfqStep2, type Candidate } from "@/components/organizer/rfq-wizard";
import { money, dateShort } from "@/lib/format";

export const metadata = { title: "Create marketplace request" };
const STEPS = [{ title: "Requirement", sub: "Event and service details" }, { title: "Recipients, Hold & Send", sub: "Choose suppliers and strategy" }];
const CAT_MATCH: Record<string, string[]> = { production: ["Production", "Sound", "Lighting"], catering: ["Catering"], security: ["Security"], entertainment: ["DJ", "Live Music"], decor: ["Decor", "Flowers"], photography: ["Photography", "Photo Booth"], marquees: ["Marquees"], transport: ["Transport"], drinks: ["Drinks"], staffing: ["Security", "Catering"] };
const s = (v: unknown) => (typeof v === "string" ? v : "");

export default async function NewRequest({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const step = s(sp.step) === "2" ? 2 : 1;
  const { data: evs } = await sb.from("events").select("id,name,starts_at,ends_at,city,location,capacity,guest_count,budget_total,cover_image,event_type").eq("workspace_id", ctx.workspace.id).not("status", "in", "(completed,closed,cancelled,archived)").order("starts_at");
  const events = (evs ?? []) as EventCtx[];
  const eventId = s(sp.event) || events[0]?.id || ""; const ev = events.find(e => e.id === eventId) ?? null;
  const category = s(sp.category) || "production";
  const pickedIds=s(sp.listing).split(',').filter(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)).slice(0,12);
  if (step === 2 && !ev) redirect("/organizer/marketplace/requests/new?step=1");
  const frame = (children: React.ReactNode) => <WizardFrame crumbs={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace", href: "/organizer/marketplace" }, { label: "Requests", href: "/organizer/marketplace?section=requests" }, { label: "New Request" }]} title="Create Marketplace Request" sub="Choose the best suppliers, set your response and hold strategy, then send your request." steps={STEPS} step={step} hrefFor={n => (n === 1 ? `/organizer/marketplace/requests/new?step=1&event=${eventId}&category=${category}` : null)}>{children}</WizardFrame>;
  if (step === 1) {
    const listing = pickedIds[0];
    const { data: l } = listing ? await sb.from("listings").select("name,category,kind").eq("id", listing).maybeSingle() : { data: null };
    return frame(<RfqStep1 initialListing={pickedIds.join(",")} events={events.map(e => ({ id: e.id, name: e.name, starts_at: e.starts_at, location: e.location, capacity: e.capacity }))} draftScope={`${ctx.workspace.id}:${ctx.user.id}`} initial={{ event_id: eventId, category:s(sp.category)||(l?.kind==="venue"?"venue":Object.entries(CAT_MATCH).find(([,values])=>values.some(value=>l?.category.toLowerCase().includes(value.toLowerCase())))?.[0]??category), ...(l ? { title: `${l.kind === "venue" ? "Venue hire" : l.category} for ${ev?.name ?? "event"}` } : {}), date: ev?.starts_at?.slice(0, 10) ?? "", location: ev?.location ?? "", capacity: ev?.capacity ? String(ev.capacity) : "" }} />);
  }
  const kinds = category === "venue" ? sb.from("listings").select(LISTING_COLS).eq("published", true).eq("kind", "venue") : sb.from("listings").select(LISTING_COLS).eq("published", true).eq("kind", "service");
  const { data: rows } = await kinds.limit(80);
  const picked=pickedIds.length?await sb.from('listings').select(LISTING_COLS).eq('published',true).in('id',pickedIds):{data:[]};
  let list = [...new Map([...((rows??[]) as unknown as Listing[]),...((picked.data??[]) as unknown as Listing[])].map(listing=>[listing.id,listing])).values()];
  const match = CAT_MATCH[category];
  if (match) { const m = list.filter(l => match.some(c => l.category.toLowerCase().includes(c.toLowerCase()))); if (m.length >= 3) list = m; }
  const avail = await availabilityFor(ctx, list.map(l => l.id), ev);
  const { data: hist } = await sb.from("build_items").select("listing_id,status").in("listing_id", list.map(l => l.id));
  const bands = new Map(await Promise.all([...new Set(list.map(l => l.workspace_id))].map(async id => { const result = await sb.rpc("reliability_band", { p_workspace:id }); return [id,result.error ? "unknown" : result.data] as const; })));
  const cands: Candidate[] = list.map(l => { const f = fitFor(l, ev); const a = avail.get(l.id)!; const h = (hist ?? []).filter(x => x.listing_id === l.id); const done = h.filter(x => x.status === "fulfilled").length;
    return { id: l.id, name: l.name, image: l.image, rating: l.rating, reviews: l.review_count, category: l.kind === "venue" ? "Venue" : l.category, badge: l.badge && ["Top Rated", "Popular", "Best Match"].includes(l.badge) ? (l.badge === "Best Match" ? "Preferred" : l.badge === "Top Rated" ? "Top rated" : l.badge) : null, fit: f.score, avail: a.state, availLabel: a.label, priceGuide: l.price_from ? `From ${money(l.price_from)}` : "On request", priceBasis: l.price_unit, distance: l.location || l.city || "Location not provided", response: l.response_hours, emergency: l.emergency_supply, reliability: bands.get(l.workspace_id) ?? "unknown", events: done };
  }).filter(c => c.avail !== "pending").sort((a,b)=>Number(pickedIds.includes(b.id))-Number(pickedIds.includes(a.id))||b.fit-a.fit).slice(0, Math.max(8,pickedIds.length));
  const pre = pickedIds.length ? pickedIds : cands.slice(0, 2).map(c => c.id);
  return frame(<RfqStep2 draftScope={`${ctx.workspace.id}:${ctx.user.id}`} candidates={cands} eventId={eventId} preselect={pre} eventDate={ev?.starts_at ? dateShort(ev.starts_at) : "event date"} initialHold={s(sp.hold) === "1" ? true : s(sp.listing) ? false : undefined} initialEmergency={s(sp.emergency) === "1"} />);
}

