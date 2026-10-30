import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCustomer } from "@/lib/data/context";
import { PlanWizard, type PlanData, type PlanStepNo } from "@/components/customer/plan-wizard";
import { allocate, benchmark, occasionLabel, normaliseCats, areaOf } from "@/lib/plan-model";
import { listingHref } from "@/lib/links";

export const metadata = { title: "Plan an Event" };
type Ev = { id: string; name: string; event_type: string; status: string; visibility: string; description: string; starts_at: string | null; ends_at: string | null; flexible_dates: boolean; location: string; city: string; guest_count: number; adults: number | null; children: number | null; budget_total: number | null; priorities: string[] | null; settings: Record<string, unknown>; cover_image: string };

export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getCustomer();
  const { data: ev } = sp.event && /^[0-9a-f-]{36}$/i.test(sp.event) ? await ctx.supabase.from("events").select("id,name,event_type,status,visibility,description,starts_at,ends_at,flexible_dates,location,city,guest_count,adults,children,budget_total,priorities,settings,cover_image").eq("id", sp.event).eq("owner_id", ctx.user.id).eq("management", "consumer").maybeSingle() : { data: null };
  const e = ev as Ev | null;
  const prio = normaliseCats(e?.priorities);
  const s = (e?.settings ?? {}) as Record<string, unknown>;
  // Furthest reachable step from what is saved (plans started on the earlier four-step wizard count guests/budget as done once priorities exist).
  const done = Number(s.plan_steps ?? 0) || 0;
  const guestsDone = done >= 3 || !!s.guests_confirmed || prio.length > 0, budgetDone = done >= 5 || (!!s.budget_mode && Number(e?.budget_total ?? 0) > 0);
  const maxStep = !e ? 1 : !e.starts_at ? 2 : !guestsDone ? 3 : !prio.length ? 4 : !budgetDone ? 5 : 6;
  const step = Math.min(Math.max(1, Number(sp.step) || (e && e.status !== "draft" ? 6 : maxStep)), maxStep) as PlanStepNo;
  const city = (e?.city || e?.location?.split(",")[0] || "London").trim() || "London";

  // Market data for the chosen city from published listings (no fabricated figures).
  const { data: venues } = await ctx.supabase.from("listings").select("id,name,slug,kind,location,city,image,price_from,price_unit,capacity_min,capacity_max,rating,review_count,lat,lng,tags,details").eq("published", true).eq("kind", "venue").order("rating", { ascending: false }).limit(60);
  const inCity = (venues ?? []).filter(v => !city || `${v.city} ${v.location}`.toLowerCase().includes(city.toLowerCase()));
  const pool = inCity.length ? inCity : venues ?? [];
  const prices = pool.map(v => Number(v.price_from)).filter(n => n > 0).sort((a, b) => a - b);
  const q = (p: number) => prices.length ? prices[Math.min(prices.length - 1, Math.floor(p * (prices.length - 1)))]! : null;
  const areaCount = new Map<string, number>(); for (const v of pool) { const a = areaOf(v.location, city); if (a) areaCount.set(a, (areaCount.get(a) ?? 0) + 1); }
  const areas = [...areaCount.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a).slice(0, 6);
  let open = 0, checked = 0;
  if (e?.starts_at && step >= 2) {
    const start = e.starts_at, end = e.ends_at ?? new Date(new Date(start).getTime() + 6 * 36e5).toISOString();
    const fits = pool.filter(v => !v.capacity_max || v.capacity_max >= (e.guest_count || 1)).slice(0, 10);
    const res = await Promise.all(fits.map(v => ctx.supabase.rpc("listing_availability", { p_listing: v.id, p_start: start, p_end: end })));
    checked = res.length; open = res.filter(r => r.data === "available").length;
  }
  const guests = e?.guest_count || 100; const type = e?.event_type ?? "wedding";
  const bench = benchmark(type, guests);
  const budget = Number(e?.budget_total ?? 0) || Math.round((bench.min + bench.max) / 2 / 500) * 500;
  const cats = [...prio, ...normaliseCats(s.optional_categories as string[])];
  const alloc = allocate(type, budget, cats.length ? cats : ["venue", "food", "drinks", "entertainment", "styling"]);
  const venueAlloc = alloc.find(a => a.key === "venue");
  const tweak = sp.tweak ?? "";
  const sized = pool.filter(v => (!v.capacity_max || v.capacity_max >= guests) && (!v.capacity_min || v.capacity_min <= guests * 1.2));
  const fitVenues = (sized.filter(v => !v.capacity_max || v.capacity_max <= Math.max(guests * 6, 300)).length ? sized.filter(v => !v.capacity_max || v.capacity_max <= Math.max(guests * 6, 300)) : sized)
    .filter(v => tweak !== "budget" || !venueAlloc || Number(v.price_from ?? 0) <= venueAlloc.amount)
    .filter(v => tweak !== "outdoor" || /outdoor|garden|terrace|rooftop/i.test(`${v.tags?.join(" ")} ${JSON.stringify(v.details)}`))
    .sort((a, b) => tweak === "unique" ? Number(a.review_count) - Number(b.review_count) : tweak === "budget" ? Number(a.price_from ?? 0) - Number(b.price_from ?? 0) : Number(b.rating) - Number(a.rating));
  const { data: saved } = await ctx.supabase.from("saved_items").select("item_key").eq("user_id", ctx.user.id).like("item_key", "listing:%");
  const savedSet = new Set((saved ?? []).map(x => x.item_key));
  const base = e ? `/plan?event=${e.id}` : "/plan?";
  // W11 (lane C): tiles and labels come from event_type_aliases; modules, online copy and public/ticketing rules from
  // event_type_rules(type) — the same rules the database enforces.
  const { data: aliasRows } = await ctx.supabase.from("event_type_aliases" as never).select("event_type,label,plan_tile,sort").order("sort" as never);
  // Every event type is offered: types without a tile assignment join "More types" (before "Something else"), so none are unreachable.
  const aliases = ((aliasRows ?? []) as { event_type: string; label: string; plan_tile: "primary" | "more" | null }[])
    .map(a => ({ ...a, plan_tile: a.plan_tile ?? "more" as const }))
    .sort((a, b) => Number(a.event_type === "custom") - Number(b.event_type === "custom"));
  const ruleKeys = [...new Set([...aliases.map(a => a.event_type), ...(e?.event_type ? [e.event_type] : [])])];
  const rules = await Promise.all(ruleKeys.map(k => ctx.supabase.rpc("event_type_rules" as never, { p_type: k } as never).then(r => [k, r.data] as const, () => [k, null] as const)));
  type Rule = { online?: boolean; modules?: unknown; label?: string; public_listing_allowed?: boolean; ticketing?: string };
  const profiles = Object.fromEntries(rules.filter(([, r]) => r).map(([k, r]) => { const x = r as unknown as Rule; return [k, { online: !!x.online, modules: Array.isArray(x.modules) ? (x.modules as unknown[]).filter((m): m is string => typeof m === "string") : [], label: x.label, publicAllowed: x.public_listing_allowed !== false, ticketing: x.ticketing }]; }));
  const typeTiles = { primary: aliases.filter(a => a.plan_tile === "primary").map(a => ({ key: a.event_type, label: a.label })), more: aliases.filter(a => a.plan_tile === "more").map(a => ({ key: a.event_type, label: a.label })) };

  const data: PlanData = {
    event: e ? { id: e.id, status: e.status, name: e.name, event_type: e.event_type, visibility: e.visibility as "private" | "public", description: e.description ?? "", agent_help: s.agent_help !== false,
      date: e.starts_at ? new Date(e.starts_at).toLocaleDateString("en-CA", { timeZone: "Europe/London" }) : "", start: e.starts_at ? new Date(e.starts_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }) : "18:00",
      end: e.ends_at ? new Date(e.ends_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }) : "23:00", date_mode: (s.date_mode as "single" | "flexible") ?? "single", flex_to: (s.flex_to as string) ?? "", flexible_window: !!s.flexible_window,
      location: e.location || "", radius: Number(s.radius_miles ?? 10), guests: e.guest_count || 100, adults: e.adults ?? 0, children: e.children ?? 0, infants: Number(s.infants ?? 0),
      budget_mode: (s.budget_mode as "total" | "range" | "suggest") ?? "total", budget: Number(e.budget_total ?? 0), budget_min: Number(s.budget_min ?? 0), budget_max: Number(s.budget_max ?? 0),
      must: prio, optional: normaliseCats(s.optional_categories as string[]), style: (s.style as string) ?? "classic", access: (s.accessibility as string[]) ?? [] } : null,
    insights: { city, areas, priceLow: q(0.25), priceHigh: q(0.75), venues: pool.length, open, checked, pins: pool.filter(v => v.lat && v.lng).slice(0, 25).map(v => ({ id: v.id, lat: v.lat!, lng: v.lng!, label: v.name, href: listingHref(v.kind, v.slug, v.id) })) },
    bench, budget, alloc,
    venues: fitVenues.slice(0, 3).map(v => ({ id: v.id, name: v.name, image: v.image, location: v.location, price_from: v.price_from == null ? null : Number(v.price_from), price_hi: v.price_from == null ? null : Math.round(Number(v.price_from) * 1.6 / 100) * 100, cap: [v.capacity_min, v.capacity_max], rating: Number(v.rating), reviews: v.review_count, href: listingHref(v.kind, v.slug, v.id), saved: savedSet.has(`listing:${v.id}`) })),
    mapKey: "", // tiles are proxied (/api/maps/tile); the key never reaches the browser
    occasionTitle: occasionLabel(type), reach: maxStep as PlanStepNo, profiles, typeTiles,
  };
  return <div className="pw">
    <div className="pw-head"><Link href={e && e.status !== "draft" ? `/account/events/${e.id}` : "/account/events"} className="pw-back"><ArrowLeft size={16} />{e && e.status !== "draft" ? "Back to event" : "Back to home"}</Link>
      <div className="pw-title"><h1>Plan an Event</h1><p>{["Let's bring your event to life. Tell us the occasion and your goal, and we'll tailor the recommendations for you.", "When and where is your event taking place? You can be flexible to see more options.", "How many people are coming? Guest numbers shape the venues and packages we show you.", "Choose the services you need and any extras you'd like. We'll prioritise them in your plan.", "Set your budget and tell us what matters most. We'll recommend the best options for your event.", "Here's a recommended event plan based on what you've told us. Review and adjust before we create your event."][step - 1]}</p></div></div>
    <PlanWizard step={step} base={base} data={data} />
  </div>;
}
