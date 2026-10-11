import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { CreateEventWizard, type CreateData } from "@/components/organizer/create-event";
import { listingHref } from "@/lib/links";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Create event" };
const TZ = "Europe/London";

export default async function CreateEventPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase;
  const id = sp.event && /^[0-9a-f-]{36}$/i.test(sp.event) ? sp.event : null;
  const [{ data: e }, { data: venues }, { data: templates }, { data: clients }] = await Promise.all([
    id ? sb.from("events").select("id,name,event_type,client_name,visibility,goal,cover_image,starts_at,ends_at,timezone,flexible_dates,venue_listing_id,venue_name,location,capacity,budget_total,revenue_goal,target_profit,currency,settings,status").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("listings").select("id,name,slug,kind,image,location,city,rating,review_count,capacity_min,capacity_max,price_from,price_unit,tags,lat,lng,badge").eq("kind", "venue").eq("published", true).order("rating", { ascending: false }).limit(40),
    sb.from("event_templates").select("id,name,event_types,modules,description").eq("workspace_id", ctx.workspace.id).limit(12),
    sb.from("leads").select("client_name").eq("workspace_id", ctx.workspace.id).limit(100),
  ]);
  const maxStep = !e ? 1 : !e.starts_at ? 2 : !e.budget_total && !(e.settings as Record<string, unknown>)?.commercial_model ? 3 : 4;
  const step = Math.min(Math.max(1, Number(sp.step) || 1), maxStep) as 1 | 2 | 3 | 4;
  const tpl = (templates ?? []).find(t => t.id === sp.template) ?? null;
  const s = (e?.settings ?? {}) as Record<string, unknown>;
  /** ISO instant → "YYYY-MM-DDTHH:mm" wall time in London (for datetime-local inputs). */
  const wall = (d: Date) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
  const loc = (iso: string | null, def: string) => iso ? wall(new Date(iso)) : def;
  const d0 = new Date(requestTime() + 60 * 864e5); d0.setUTCHours(17, 0, 0, 0);
  const data: CreateData = {
    id: e?.id ?? null, status: e?.status ?? "draft", owner: ctx.name, maps: process.env.MAP_TILER_API_KEY ?? "",
    s1: { name: e?.name ?? "", event_type: (e?.event_type as CreateData["s1"]["event_type"]) ?? (tpl?.event_types?.[0]?.toLowerCase().includes("festival") ? "festival" : "festival"), client_name: e?.client_name ?? "", visibility: (e?.visibility as "public" | "private") ?? "public", goal: e?.goal ?? "", cover_image: e?.cover_image ?? "" },
    s2: { starts_at: loc(e?.starts_at ?? null, wall(d0)), ends_at: loc(e?.ends_at ?? null, wall(new Date(d0.getTime() + 8 * 36e5))), timezone: e?.timezone ?? TZ, flexible_dates: !!e?.flexible_dates, venue_mode: (s.venue_mode as "known" | "unknown") ?? "known", venue_listing_id: e?.venue_listing_id ?? null, venue_name: e?.venue_name ?? "", location: e?.location ?? "", capacity: e?.capacity ?? 500, capacity_type: (s.capacity_type as "standing") ?? "standing", age: s.age_limit ? `${s.age_limit}+` : "", recurring: !!s.recurring },
    s3: { model: (s.commercial_model as "ticketed") ?? "ticketed", currency: (e?.currency as "GBP") ?? "GBP", budget: Number(e?.budget_total ?? 25000), revenue: Number(e?.revenue_goal ?? 40000), profit: Number(e?.target_profit ?? 15000), avg_price: Number(s.avg_ticket_price ?? 35), tax: String(s.tax_treatment ?? "Standard rate (20% VAT)"), budget_lines: (s.budget_lines as Record<string, number>) ?? { "Venue & Production": 12000, "Staff & Crew": 4500, Marketing: 3000, Other: 5500 } },
    s4: { template_id: tpl?.id ?? (s.template_id as string) ?? null, modules: { tickets: true, providers: true, staffing: true, promotion: true, risk: true, access: true, ...((tpl?.modules as Record<string, boolean>) ?? {}), ...((s.modules as Record<string, boolean>) ?? {}) }, provider_categories: (s.provider_categories as string[]) ?? ["Venue", "Catering & Bar", "Production & AV", "Decor & Styling", "Entertainment (Acts/DJs)", "Staff & Crew"], agent_goal: "", publish: false },
    venues: (venues ?? []).map(v => ({ id: v.id, name: v.name, image: v.image, location: v.location || v.city, rating: Number(v.rating), reviews: v.review_count, cap: [v.capacity_min, v.capacity_max], price: v.price_from == null ? null : Number(v.price_from), unit: v.price_unit, tags: (v.tags ?? []).slice(0, 4), badge: v.badge, lat: v.lat, lng: v.lng, href: listingHref(v.kind, v.slug, v.id) })),
    templates: (templates ?? []).map(t => ({ id: t.id, name: t.name, types: t.event_types ?? [] })),
    clients: [...new Set((clients ?? []).map(c => c.client_name).filter(Boolean))].slice(0, 40),
  };
  return <div className="ce2">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Events", href: "/organizer/events" }, { label: "Create Event" }]} />
    <CreateEventWizard step={step} data={data} />
  </div>;
}
