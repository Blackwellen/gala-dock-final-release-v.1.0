import Link from "next/link";
import type { Metadata } from "next";
import {
  MapPin,
  CalendarRange,
  LayoutGrid,
  List as ListIcon,
  Calendar as CalendarIcon,
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
  Lock,
  Headphones,
  Sparkles,
  Accessibility as AccessibilityIcon,
  Bell,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isFlagEnabled } from "@/lib/flags/resolve";
import { globalReleaseStage } from "@/lib/flags/context";
import { PublicEventCard, type PublicEventCardData } from "@/components/public-commerce/PublicEventCard";
import { r2PublicUrl } from "@/lib/storage/r2";
import { cn } from "@/lib/utils";
import { HeroSearch } from "./HeroSearch";
import { AutoSubmitSelect, AutoSubmitCheckbox } from "./AutoSubmitSelect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discover events",
  description: "Find and book upcoming live experiences on Gala Dock.",
};

const PAGE_SIZE = 20;
const PROMOTED_LIMIT = 8;
const PRICE_SORT_CAP = 200;

type ViewMode = "grid" | "list" | "calendar" | "map";
type SortMode = "relevance" | "date" | "price_asc" | "price_desc" | "distance";

interface DiscoverSearchParams {
  q?: string;
  category?: string;
  event_type?: string;
  city?: string;
  venue?: string;
  from?: string;
  to?: string;
  price?: string; // preset range, e.g. "0-5000" | "50000-"
  accessible?: string; // "1"
  sort?: string;
  view?: string;
  page?: string;
  lat?: string;
  lng?: string;
}

/** Real great-circle distance in km — used only when the visitor shares their location. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type PublicPageRow = {
  event_id: string;
  slug: string;
  headline: string | null;
  summary: string | null;
  starts_at: string | null;
  doors_at: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  event_type: string | null;
  venue_name: string | null;
  hero_path: string | null;
  promoted: boolean;
  latitude: number | null;
  longitude: number | null;
  accessibility_features: unknown;
};

const PRICE_PRESETS: { value: string; label: string; min: number | null; max: number | null }[] = [
  { value: "", label: "Any price", min: null, max: null },
  { value: "0-0", label: "Free", min: 0, max: 0 },
  { value: "0-5000", label: "Under $50", min: 0, max: 5000 },
  { value: "5000-10000", label: "$50 – $100", min: 5000, max: 10000 },
  { value: "10000-25000", label: "$100 – $250", min: 10000, max: 25000 },
  { value: "25000-50000", label: "$250 – $500", min: 25000, max: 50000 },
  { value: "50000-", label: "$500+", min: 50000, max: null },
];

function startOfDayISO(d: Date) {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c.toISOString();
}
function endOfDayISO(d: Date) {
  const c = new Date(d);
  c.setUTCHours(23, 59, 59, 999);
  return c.toISOString();
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<DiscoverSearchParams>;
}) {
  const sp = await searchParams;

  const enabled = isFlagEnabled("publicEventsDirectory", {
    workspaceType: "organizer",
    releaseStage: globalReleaseStage(),
    plan: "enterprise",
  });

  if (!enabled) {
    return (
      <div className="bg-surface-50 min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-surface-900">Discover events</h1>
          <p className="mt-2 text-surface-500">This directory isn&apos;t available right now. Check back soon.</p>
        </div>
      </div>
    );
  }

  const q = sp.q?.trim() || "";
  const category = sp.category?.trim() || "";
  const eventType = sp.event_type?.trim() || "";
  const city = sp.city?.trim() || "";
  const venue = sp.venue?.trim() || "";
  const from = sp.from || "";
  const to = sp.to || "";
  const priceKey = sp.price || "";
  const accessible = sp.accessible === "1";
  const view: ViewMode = (["grid", "list", "calendar", "map"] as const).includes(sp.view as ViewMode)
    ? (sp.view as ViewMode)
    : "grid";
  const sort: SortMode = (["relevance", "date", "price_asc", "price_desc", "distance"] as const).includes(sp.sort as SortMode)
    ? (sp.sort as SortMode)
    : "date";
  const page = Math.max(1, Number(sp.page) || 1);
  const myLat = sp.lat ? Number(sp.lat) : null;
  const myLng = sp.lng ? Number(sp.lng) : null;
  const hasMyLocation = myLat != null && myLng != null && Number.isFinite(myLat) && Number.isFinite(myLng);

  const pricePreset = PRICE_PRESETS.find((p) => p.value === priceKey) ?? PRICE_PRESETS[0];

  const supabase = await createClient();

  const SELECT_COLS =
    "event_id, slug, headline, summary, starts_at, doors_at, city, country, category, event_type, venue_name, hero_path, promoted, latitude, longitude, accessibility_features";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(qb: any) {
    qb = qb.eq("published", true);
    if (q) qb = qb.or(`headline.ilike.%${q}%,summary.ilike.%${q}%,venue_name.ilike.%${q}%`);
    if (category) qb = qb.eq("category", category);
    if (eventType) qb = qb.eq("event_type", eventType);
    if (city) qb = qb.ilike("city", `%${city}%`);
    if (venue) qb = qb.ilike("venue_name", `%${venue}%`);
    if (from) qb = qb.gte("starts_at", from);
    if (to) qb = qb.lte("starts_at", to);
    if (accessible) qb = qb.not("accessibility_features", "eq", "[]");
    return qb;
  }

  // --- distinct filter option lists (real data, capped for performance) ---
  const { data: facetRows } = await supabase
    .from("event_public_pages")
    .select("category, event_type, city")
    .eq("published", true)
    .limit(1000);

  const categoryCounts = new Map<string, number>();
  const eventTypeSet = new Set<string>();
  const citySet = new Set<string>();
  for (const r of facetRows ?? []) {
    if (r.category) categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);
    if (r.event_type) eventTypeSet.add(r.event_type);
    if (r.city) citySet.add(r.city);
  }
  const categoryOptions = [...categoryCounts.keys()].sort();
  const eventTypeOptions = [...eventTypeSet].sort();
  const cityOptions = [...citySet].sort();
  const trendingCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);

  // --- promoted rail ---
  const promotedQuery = applyFilters(
    supabase.from("event_public_pages").select(SELECT_COLS).eq("promoted", true).order("starts_at", { ascending: true })
  ).limit(PROMOTED_LIMIT);
  const { data: promotedRows } = await promotedQuery;

  // --- main result set ---
  let total = 0;
  let pageRows: PublicPageRow[] = [];

  if (sort === "distance" && hasMyLocation) {
    // Distance sort requires a real lat/lng on both sides — computed here from the visitor's own
    // shared geolocation against each event's real venue coordinates (haversine), never fabricated.
    const wideQuery = applyFilters(
      supabase.from("event_public_pages").select(SELECT_COLS, { count: "exact" }).not("latitude", "is", null).not("longitude", "is", null)
    ).limit(PRICE_SORT_CAP);
    const { data } = await wideQuery;
    const rows = (data ?? []) as PublicPageRow[];
    rows.sort((a, b) => {
      const da = haversineKm(myLat!, myLng!, a.latitude!, a.longitude!);
      const db = haversineKm(myLat!, myLng!, b.latitude!, b.longitude!);
      return da - db;
    });
    total = rows.length;
    pageRows = rows.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);
  } else if (sort === "price_asc" || sort === "price_desc") {
    // Price sort requires prices computed before ordering: fetch a bounded window (directory-scale
    // cap), price + sort in JS, then paginate in memory. See report for the trade-off this implies
    // on very large result sets.
    const wideQuery = applyFilters(
      supabase.from("event_public_pages").select(SELECT_COLS, { count: "exact" }).order("starts_at", { ascending: true })
    ).limit(PRICE_SORT_CAP);
    const { data, count } = await wideQuery;
    total = count ?? 0;
    const rows = (data ?? []) as PublicPageRow[];
    const prices = await priceMapFor(supabase, rows.map((r) => r.event_id));
    rows.sort((a, b) => {
      const pa = prices.get(a.event_id)?.fromPriceCents ?? Number.POSITIVE_INFINITY;
      const pb = prices.get(b.event_id)?.fromPriceCents ?? Number.POSITIVE_INFINITY;
      return sort === "price_asc" ? pa - pb : pb - pa;
    });
    pageRows = rows.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);
  } else {
    const listQuery = applyFilters(
      supabase.from("event_public_pages").select(SELECT_COLS, { count: "exact" }).order("starts_at", { ascending: true, nullsFirst: false })
    ).range((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count } = await listQuery;
    total = count ?? 0;
    pageRows = (data ?? []) as PublicPageRow[];
  }

  // --- ticket price / availability for the rows actually being rendered ---
  const allIds = [...new Set([...(promotedRows ?? []).map((r: PublicPageRow) => r.event_id), ...pageRows.map((r) => r.event_id)])];
  const priceMap = await priceMapFor(supabase, allIds);

  // apply the price preset filter in JS against the computed prices (directory-scale — see report)
  let filteredPageRows = pageRows;
  if (pricePreset.min != null || pricePreset.max != null) {
    filteredPageRows = pageRows.filter((r) => {
      const cents = priceMap.get(r.event_id)?.fromPriceCents;
      if (cents == null) return false;
      if (pricePreset.min != null && cents < pricePreset.min) return false;
      if (pricePreset.max != null && cents > pricePreset.max) return false;
      return true;
    });
  }

  function toCardData(r: PublicPageRow): PublicEventCardData {
    const p = priceMap.get(r.event_id);
    return {
      slug: r.slug,
      headline: r.headline ?? "Event",
      category: r.category,
      eventType: r.event_type,
      startsAt: r.starts_at,
      doorsAt: r.doors_at,
      venueName: r.venue_name,
      city: r.city,
      fromPriceCents: p?.fromPriceCents ?? null,
      currency: p?.currency ?? "GBP",
      heroUrl: r2PublicUrl(r.hero_path),
      promoted: r.promoted,
      soldOut: p?.soldOut ?? false,
      lowAvailability: p?.lowAvailability ?? false,
      ratingAvg: null,
      ratingCount: null,
      ticketsSold: p?.ticketsSold ?? null,
      favourited: false,
    };
  }

  const promotedCards: PublicEventCardData[] = ((promotedRows ?? []) as PublicPageRow[]).map((r) => toCardData(r));
  const resultCards = filteredPageRows.map(toCardData);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || category || eventType || city || venue || from || to || priceKey || accessible || hasMyLocation);

  function qs(overrides: Record<string, string | null>) {
    const params = new URLSearchParams();
    const base: Record<string, string> = {
      q,
      category,
      event_type: eventType,
      city,
      venue,
      from,
      to,
      price: priceKey,
      accessible: accessible ? "1" : "",
      sort,
      view,
      lat: hasMyLocation ? String(myLat) : "",
      lng: hasMyLocation ? String(myLng) : "",
    };
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    return params.toString();
  }
  function href(overrides: Record<string, string | null>) {
    const s = qs(overrides);
    return s ? `/discover?${s}` : "/discover";
  }

  // 7-day date strip
  const strip: { date: Date; label: string; sub: string }[] = [];
  const anchor = from ? new Date(from) : new Date();
  anchor.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() + i);
    const isToday = d.getTime() === today.getTime();
    strip.push({
      date: d,
      label: isToday ? "Today" : d.toLocaleDateString("en-GB", { weekday: "short" }),
      sub: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    });
  }

  // map bounding box from rows with real coordinates
  const coordRows = [...(promotedRows ?? []), ...filteredPageRows].filter(
    (r): r is PublicPageRow & { latitude: number; longitude: number } => r.latitude != null && r.longitude != null
  );
  const mapEmbedSrc = (() => {
    if (coordRows.length === 0) return null;
    const lats = coordRows.map((r) => r.latitude);
    const lngs = coordRows.map((r) => r.longitude);
    const pad = 0.05;
    const minLat = Math.min(...lats) - pad;
    const maxLat = Math.max(...lats) + pad;
    const minLng = Math.min(...lngs) - pad;
    const maxLng = Math.max(...lngs) + pad;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik`;
  })();

  const areaLabel = hasMyLocation ? "Near you" : city || "All areas";

  return (
    <div className="bg-surface-50 min-h-screen">
      {/* Hero + search */}
      <section className="relative overflow-hidden border-b border-surface-200 bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-brand-200/50 via-indigo-200/40 to-transparent blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-[-8%] h-[360px] w-[360px] rounded-full bg-gradient-to-tr from-purple-200/40 via-brand-100/30 to-transparent blur-3xl"
        />
        <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            <Sparkles className="h-3 w-3" /> Live on Gala Dock
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight text-surface-900">
            Find the <span className="bg-gradient-to-r from-brand-600 to-indigo-600 bg-clip-text text-transparent">perfect event</span>
            <br className="hidden sm:block" /> near you
          </h1>
          <p className="mt-3 max-w-xl text-sm sm:text-base text-surface-500">
            Search across live experiences on Gala Dock and book with confidence.
          </p>

          <HeroSearch q={q} city={city} from={from} to={to} view={view} sort={sort} cityOptions={cityOptions} />

          {trendingCategories.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-surface-400">Popular searches:</span>
              {trendingCategories.map((c) => (
                <Link
                  key={c}
                  href={href({ category: c })}
                  className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  {c}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Filter bar */}
      <section className="border-b border-surface-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-3">
          <form
            method="get"
            action="/discover"
            className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <input type="hidden" name="q" value={q} />
            <input type="hidden" name="view" value={view} />
            {hasMyLocation && (
              <>
                <input type="hidden" name="lat" value={myLat!} />
                <input type="hidden" name="lng" value={myLng!} />
              </>
            )}

            <FilterField>
              <CalendarRange className="h-3.5 w-3.5 text-surface-400 shrink-0" />
              <input
                type="date"
                name="from"
                defaultValue={from}
                aria-label="From date"
                className="bg-transparent text-xs focus:outline-none w-[92px]"
              />
              <span className="text-surface-300">–</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                aria-label="To date"
                className="bg-transparent text-xs focus:outline-none w-[92px]"
              />
            </FilterField>

            <FilterField>
              <AutoSubmitSelect name="category" label="All categories" value={category} options={categoryOptions} />
            </FilterField>
            <FilterField>
              <Sparkles className="h-3.5 w-3.5 text-surface-400 shrink-0" />
              <AutoSubmitSelect name="event_type" label="All event types" value={eventType} options={eventTypeOptions} />
            </FilterField>
            <FilterField>
              <MapPin className="h-3.5 w-3.5 text-surface-400 shrink-0" />
              <AutoSubmitSelect name="city" label="All areas" value={city} options={cityOptions} />
            </FilterField>

            <FilterField>
              <input
                type="text"
                name="venue"
                defaultValue={venue}
                placeholder="Venue"
                className="bg-transparent text-xs focus:outline-none w-[110px] placeholder:text-surface-400"
              />
            </FilterField>

            <FilterField>
              <AutoSubmitSelect
                name="price"
                label="Any price"
                value={priceKey}
                options={PRICE_PRESETS.filter((p) => p.value).map((p) => p.value)}
                optionLabels={Object.fromEntries(PRICE_PRESETS.map((p) => [p.value, p.label]))}
              />
            </FilterField>

            <AutoSubmitCheckbox name="accessible" checked={accessible} icon={<AccessibilityIcon className="h-3.5 w-3.5" />} label="Accessibility" />

            <FilterField>
              <AutoSubmitSelect
                name="sort"
                label="Sort"
                includeBlank={false}
                value={sort}
                options={hasMyLocation ? ["relevance", "date", "price_asc", "price_desc", "distance"] : ["relevance", "date", "price_asc", "price_desc"]}
                optionLabels={{
                  relevance: "Sort: Relevance",
                  date: "Sort: Date",
                  price_asc: "Sort: Price low–high",
                  price_desc: "Sort: Price high–low",
                  distance: "Sort: Distance",
                }}
              />
            </FilterField>

            <button type="submit" className="shrink-0 rounded-full bg-surface-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-surface-800">
              Apply
            </button>

            {hasFilters && (
              <Link href={href({ q: null, category: null, event_type: null, city: null, venue: null, from: null, to: null, price: null, accessible: null, sort: "date", lat: null, lng: null })} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-surface-500 hover:text-surface-900">
                <X className="h-3.5 w-3.5" /> Clear all
              </Link>
            )}
          </form>

          {/* View switcher + date strip */}
          <div className="mt-3 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="inline-flex shrink-0 rounded-lg border border-surface-200 bg-surface-50 p-0.5">
              <ViewTab hrefBase={href} view="grid" active={view === "grid"} icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Grid" />
              <ViewTab hrefBase={href} view="list" active={view === "list"} icon={<ListIcon className="h-3.5 w-3.5" />} label="List" />
              <ViewTab hrefBase={href} view="calendar" active={view === "calendar"} icon={<CalendarIcon className="h-3.5 w-3.5" />} label="Calendar" />
              <ViewTab hrefBase={href} view="map" active={view === "map"} icon={<MapIcon className="h-3.5 w-3.5" />} label="Map" />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link href={href({ from: strip[0] ? startOfDayISO(new Date(strip[0].date.getTime() - 86400000)) : null })} className="shrink-0 grid h-7 w-7 place-items-center rounded-md text-surface-400 hover:bg-surface-100">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              {strip.map((d, i) => {
                const isActive = from ? d.date.getTime() === new Date(from).setUTCHours(0, 0, 0, 0) : i === 0 && !from;
                return (
                  <Link
                    key={d.date.toISOString()}
                    href={href({ from: startOfDayISO(d.date), to: endOfDayISO(d.date) })}
                    className={cn(
                      "shrink-0 rounded-lg px-3 py-1.5 text-center text-xs transition-colors",
                      isActive ? "bg-brand-600 text-white font-semibold" : "text-surface-600 hover:bg-surface-100"
                    )}
                  >
                    <div>{d.label}</div>
                    <div className={cn("text-[10px]", isActive ? "text-white/80" : "text-surface-400")}>{d.sub}</div>
                  </Link>
                );
              })}
              <Link href={href({ from: strip[6] ? startOfDayISO(new Date(strip[6].date.getTime() + 86400000)) : null })} className="shrink-0 grid h-7 w-7 place-items-center rounded-md text-surface-400 hover:bg-surface-100">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <Link href={href({ view: "calendar" })} className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
              <CalendarIcon className="h-3.5 w-3.5" /> View full calendar
            </Link>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="min-w-0 flex-1">
            {/* Promoted rail */}
            {promotedCards.length > 0 && (
              <div className="mb-6 rounded-2xl border border-surface-200 bg-white shadow-sm p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-warning-100 text-warning-600">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-surface-900">Promoted Events</h2>
                    <p className="text-xs text-surface-400">Handpicked experiences you don&apos;t want to miss.</p>
                  </div>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {promotedCards.map((e: PublicEventCardData) => (
                    <PublicEventCard key={e.slug} event={e} variant="compact" className="w-56 shrink-0" />
                  ))}
                </div>
              </div>
            )}

            {/* Result count */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-surface-500">
                <span className="font-semibold text-surface-900">{total.toLocaleString("en-GB")}</span> events found in{" "}
                <span className="inline-flex items-center gap-1 font-medium text-surface-700">
                  <MapPin className="h-3.5 w-3.5" /> {areaLabel}
                </span>
              </p>
            </div>

            {view === "calendar" ? (
              <div className="rounded-2xl border border-dashed border-surface-300 bg-white p-12 text-center">
                <CalendarIcon className="mx-auto h-8 w-8 text-surface-300" />
                <h3 className="mt-3 text-sm font-semibold text-surface-900">Calendar view is coming soon</h3>
                <p className="mt-1 text-sm text-surface-500">
                  Use the date strip above or Grid/List view to browse events by date in the meantime.
                </p>
              </div>
            ) : view === "map" ? (
              <div className="space-y-4">
                <div className="h-[420px] overflow-hidden rounded-2xl border border-surface-200 bg-surface-100">
                  {mapEmbedSrc ? (
                    <iframe title="Event map" className="h-full w-full border-0" loading="lazy" src={mapEmbedSrc} />
                  ) : (
                    <div className="grid h-full place-items-center text-center px-6">
                      <div>
                        <MapIcon className="mx-auto h-6 w-6 text-surface-400" />
                        <p className="mt-2 text-sm text-surface-500">
                          No venues with saved coordinates in this result set — map pins need venue location data.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {resultCards.map((e) => (
                    <PublicEventCard key={e.slug} event={e} variant="mini" />
                  ))}
                </div>
              </div>
            ) : resultCards.length === 0 ? (
              <div className="rounded-2xl border border-surface-200 bg-white shadow-sm p-12 text-center">
                <p className="text-sm font-medium text-surface-900">No events match your search.</p>
                <p className="mt-1 text-sm text-surface-500">Try widening your dates, price range or clearing a filter.</p>
              </div>
            ) : view === "list" ? (
              <div className="flex flex-col gap-3">
                {resultCards.map((e) => (
                  <PublicEventCard key={e.slug} event={e} variant="horizontal" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {resultCards.map((e) => (
                  <PublicEventCard key={e.slug} event={e} variant="grid" />
                ))}
              </div>
            )}

            {view !== "calendar" && view !== "map" && resultCards.length > 0 && (
              <div className="mt-8 flex flex-col items-center gap-2">
                {page < totalPages && (
                  <Link
                    href={href({ page: String(page + 1) })}
                    className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-6 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    Load more events
                  </Link>
                )}
                <p className="text-xs text-surface-400">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString("en-GB")} events
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-[300px] shrink-0 space-y-4 order-first lg:order-none">
            <div className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
              <div className="h-48 bg-surface-100">
                {mapEmbedSrc ? (
                  <iframe title="Nearby events map" className="h-full w-full border-0" loading="lazy" src={mapEmbedSrc} />
                ) : (
                  <div className="grid h-full place-items-center text-center px-6">
                    <div>
                      <MapIcon className="mx-auto h-5 w-5 text-surface-400" />
                      <p className="mt-1.5 text-xs text-surface-500">No mapped venues for this search yet.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-surface-200 bg-white shadow-sm p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-surface-900">Saved searches</h3>
              </div>
              <div className="rounded-lg border border-dashed border-surface-200 bg-surface-50 p-3 text-center">
                <p className="text-xs text-surface-500">Sign in to save this search and get notified about new matches.</p>
                <Link href="/login" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  <Bell className="h-3.5 w-3.5" /> Sign in
                </Link>
              </div>
            </div>

            {trendingCategories.length > 0 && (
              <div className="rounded-2xl border border-surface-200 bg-white shadow-sm p-4">
                <h3 className="mb-2 text-sm font-semibold text-surface-900">Trending searches</h3>
                <div className="flex flex-wrap gap-1.5">
                  {trendingCategories.map((c) => (
                    <Link
                      key={c}
                      href={href({ category: c })}
                      className="rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600 hover:bg-surface-200"
                    >
                      {c}
                    </Link>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-surface-400">Based on categories currently listed on Gala Dock.</p>
              </div>
            )}
          </aside>
        </div>

        {/* Trust strip */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-2xl border border-surface-200 bg-white shadow-sm p-5">
          <TrustItem icon={<ShieldCheck className="h-4 w-4" />} title="No hidden fees" sub="Transparent pricing" />
          <TrustItem icon={<Zap className="h-4 w-4" />} title="Instant delivery" sub="Mobile tickets" />
          <TrustItem icon={<Lock className="h-4 w-4" />} title="Secure & reliable" sub="Enterprise-grade platform" />
          <TrustItem icon={<Headphones className="h-4 w-4" />} title="24/7 support" sub="Real humans, real help" />
        </div>
      </div>
    </div>
  );
}

async function priceMapFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventIds: string[]
): Promise<Map<string, { fromPriceCents: number | null; currency: string; soldOut: boolean; lowAvailability: boolean; ticketsSold: number | null }>> {
  const out = new Map<string, { fromPriceCents: number | null; currency: string; soldOut: boolean; lowAvailability: boolean; ticketsSold: number | null }>();
  if (eventIds.length === 0) return out;

  const { data: tiers } = await supabase
    .from("ticket_types")
    .select("event_id, price_cents, currency, quantity, sold")
    .in("event_id", eventIds)
    .eq("status", "on_sale");

  const byEvent = new Map<string, { minPrice: number; currency: string; remaining: number; sold: number; hasTiers: boolean }>();
  for (const t of tiers ?? []) {
    const cur = byEvent.get(t.event_id) ?? { minPrice: Number.POSITIVE_INFINITY, currency: t.currency ?? "GBP", remaining: 0, sold: 0, hasTiers: false };
    cur.hasTiers = true;
    if (t.price_cents != null && t.price_cents < cur.minPrice) {
      cur.minPrice = t.price_cents;
      cur.currency = t.currency ?? cur.currency;
    }
    const remaining = Math.max(0, (t.quantity ?? 0) - (t.sold ?? 0));
    cur.remaining += remaining;
    cur.sold += t.sold ?? 0;
    byEvent.set(t.event_id, cur);
  }

  for (const id of eventIds) {
    const agg = byEvent.get(id);
    if (!agg || !agg.hasTiers) {
      out.set(id, { fromPriceCents: null, currency: "GBP", soldOut: false, lowAvailability: false, ticketsSold: null });
      continue;
    }
    out.set(id, {
      fromPriceCents: Number.isFinite(agg.minPrice) ? agg.minPrice : null,
      currency: agg.currency,
      soldOut: agg.remaining <= 0,
      lowAvailability: agg.remaining > 0 && agg.remaining <= 20,
      ticketsSold: agg.sold,
    });
  }
  return out;
}

function FilterField({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-surface-200 bg-white px-3 py-1.5">
      {children}
    </div>
  );
}

function ViewTab({
  hrefBase,
  view,
  active,
  icon,
  label,
}: {
  hrefBase: (overrides: Record<string, string | null>) => string;
  view: ViewMode;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={hrefBase({ view, page: null })}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? "bg-brand-600 text-white shadow-sm" : "text-surface-500 hover:text-surface-900"
      )}
    >
      {icon} {label}
    </Link>
  );
}

function TrustItem({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-surface-900 truncate">{title}</p>
        <p className="text-[11px] text-surface-400 truncate">{sub}</p>
      </div>
    </div>
  );
}
