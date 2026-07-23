import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Music4,
  Trophy,
  Theater,
  Smile,
  PartyPopper,
  Users2,
  Presentation,
  MoreHorizontal,
  Search,
  MapPin,
  ShieldCheck,
  Ticket,
  Sparkles,
  Smartphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { r2PublicUrl } from "@/lib/storage/r2";
import { PublicEventCard, type PublicEventCardData } from "@/components/public-commerce/PublicEventCard";

// The V1.5+ homepage — public ticket sales & event discovery are enabled. Rendered when the
// publicEventsDirectory flag is on. Featured events + the two headline stats are real Supabase
// reads (event_public_pages / ticket_orders) — no hardcoded event or metric data.

const CATEGORIES = [
  { label: "Music", icon: Music4 },
  { label: "Sports", icon: Trophy },
  { label: "Theatre", icon: Theater },
  { label: "Comedy", icon: Smile },
  { label: "Festivals", icon: PartyPopper },
  { label: "Family", icon: Users2 },
  { label: "Conferences", icon: Presentation },
  { label: "More", icon: MoreHorizontal },
];

const FAN_FEATURES = [
  { icon: Ticket, title: "Flexible ticket tiers", desc: "General admission, VIP, early bird and more — priced by the organiser." },
  { icon: MapPin, title: "Clear venue details", desc: "Address, doors time and schedule up front, so fans know exactly what to expect." },
  { icon: ShieldCheck, title: "Secure checkout", desc: "Card payments processed securely, with an order confirmation for every purchase." },
  { icon: Smartphone, title: "Mobile-friendly tickets", desc: "Order confirmations and ticket details are accessible from any device." },
];

async function loadHomeData() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: pages }, { count: liveEventsCount }, { data: paidOrders }] = await Promise.all([
    supabase
      .from("event_public_pages")
      .select("slug, headline, category, event_type, starts_at, doors_at, venue_name, city, promoted, hero_path")
      .eq("published", true)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(5),
    supabase
      .from("event_public_pages")
      .select("id", { count: "exact", head: true })
      .eq("published", true),
    supabase.from("ticket_orders").select("quantity, event_id").eq("status", "paid"),
  ]);

  const eventSlugs = (pages ?? []).map((p) => p.slug);
  const { data: idsForPricing } = eventSlugs.length
    ? await supabase.from("event_public_pages").select("event_id, slug").in("slug", eventSlugs)
    : { data: [] as { event_id: string; slug: string }[] };

  const slugToEventId = new Map((idsForPricing ?? []).map((r) => [r.slug, r.event_id]));
  const eventIdList = (idsForPricing ?? []).map((r) => r.event_id);

  const { data: ticketTypes } = eventIdList.length
    ? await supabase
        .from("ticket_types")
        .select("event_id, price_cents, currency")
        .in("event_id", eventIdList)
        .eq("status", "on_sale")
    : { data: [] as { event_id: string; price_cents: number; currency: string }[] };

  const minPriceByEvent = new Map<string, { cents: number; currency: string }>();
  for (const t of ticketTypes ?? []) {
    const existing = minPriceByEvent.get(t.event_id);
    if (!existing || t.price_cents < existing.cents) {
      minPriceByEvent.set(t.event_id, { cents: t.price_cents, currency: t.currency });
    }
  }

  const featuredEvents: PublicEventCardData[] = (pages ?? []).map((p) => {
    const eventId = slugToEventId.get(p.slug);
    const price = eventId ? minPriceByEvent.get(eventId) : undefined;
    return {
      slug: p.slug,
      headline: p.headline ?? "Event",
      category: p.category,
      eventType: p.event_type,
      startsAt: p.starts_at,
      doorsAt: p.doors_at,
      venueName: p.venue_name,
      city: p.city,
      fromPriceCents: price?.cents ?? null,
      currency: price?.currency ?? "GBP",
      heroUrl: r2PublicUrl(p.hero_path),
      promoted: p.promoted,
      soldOut: false,
      lowAvailability: false,
      ratingAvg: null,
      ratingCount: null,
      ticketsSold: null,
    };
  });

  const ticketsSold = (paidOrders ?? []).reduce((sum, o) => sum + (o.quantity ?? 0), 0);

  return {
    featuredEvents,
    liveEventsCount: liveEventsCount ?? 0,
    ticketsSold,
  };
}

function StatValue({ value }: { value: number }) {
  if (value >= 1000) return <>{formatNumber(Math.floor(value / 1000))}K+</>;
  if (value > 0) return <>{formatNumber(value)}+</>;
  return <>0</>;
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pt-16 pb-10 px-6">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-50/60 via-white to-violet-50/40 pointer-events-none" />

      <div className="relative max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
          All-in-one platform for events, tickets &amp; operations
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-900 tracking-tight leading-[1.1] mb-5">
          Discover unforgettable events.
          <br />
          <span className="text-brand-600">Sell tickets</span> with ease.
        </h1>

        <p className="text-lg text-surface-500 max-w-xl mx-auto mb-8 leading-relaxed">
          Gala Dock is the all-in-one event operating system for organisers, and the best place for
          fans to discover and book amazing experiences.
        </p>

        <form
          action="/discover"
          method="GET"
          className="flex flex-col sm:flex-row items-stretch gap-2 max-w-2xl mx-auto mb-6 p-2 rounded-2xl border border-surface-200 bg-white shadow-lg shadow-surface-900/5"
        >
          <div className="flex-1 flex items-center gap-2 px-3 py-2">
            <Search className="w-4 h-4 text-surface-400 shrink-0" />
            <input
              type="text"
              name="q"
              placeholder="Search events, artists or venues"
              className="w-full text-sm outline-none placeholder:text-surface-400"
            />
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 border-l border-surface-100">
            <MapPin className="w-4 h-4 text-surface-400 shrink-0" />
            <input
              type="text"
              name="city"
              placeholder="All locations"
              className="w-32 text-sm outline-none placeholder:text-surface-400"
            />
          </div>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors shrink-0"
          >
            <Search className="w-4 h-4" strokeWidth={2} />
            Search Events
          </button>
        </form>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
          <Link
            href="/discover"
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-brand-600/20"
          >
            Explore Events
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
          <Link
            href="/signup"
            className="flex items-center gap-2 px-6 py-3 border border-surface-200 hover:bg-surface-50 text-surface-700 font-medium rounded-xl text-sm transition-colors"
          >
            Sell Tickets
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-surface-500">
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="w-4 h-4 text-brand-500" /> No hidden fees — transparent pricing
          </span>
          <span className="flex items-center gap-1.5">
            <Ticket className="w-4 h-4 text-brand-500" /> Instant delivery — digital tickets
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand-500" /> Secure &amp; reliable checkout
          </span>
        </div>
      </div>
    </section>
  );
}

function FeaturedEventsSection({ events }: { events: PublicEventCardData[] }) {
  return (
    <section className="py-14 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-surface-900">Featured Upcoming Events</h2>
          <Link href="/discover" className="text-sm font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
            View all events <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-surface-50 p-10 text-center">
            <CalendarDays className="w-8 h-8 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-600 font-medium">No events published yet</p>
            <p className="text-sm text-surface-400 mt-1 mb-4">Be the first to launch a public event page on Gala Dock.</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
            >
              Start selling tickets <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {events.map((event) => (
              <PublicEventCard key={event.slug} event={event} variant="grid" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CategorySection() {
  return (
    <section className="py-14 px-6 bg-surface-50">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-xl font-bold text-surface-900 mb-6">Browse by Category</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.label}
                href={c.label === "More" ? "/discover" : `/discover?category=${encodeURIComponent(c.label)}`}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-surface-200 bg-white hover:border-brand-200 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                </div>
                <span className="text-xs font-medium text-surface-700">{c.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FanFeaturesSection() {
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 max-w-lg">
          <p className="text-brand-600 text-sm font-semibold mb-2">Everything you need. Built in.</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-4">
            A better experience for every fan
          </h2>
          <p className="text-surface-500 leading-relaxed">
            From finding the perfect event to holding your ticket at the door — we make every step
            effortless.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FAN_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border border-surface-200 p-6 hover:border-brand-200 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                </div>
                <h3 className="font-semibold text-surface-900 mb-2 text-sm">{f.title}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function OrganiserSection() {
  return (
    <section className="py-20 px-6 bg-surface-50">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-gradient-to-br from-brand-700 via-indigo-700 to-violet-800 relative">
          <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/95 backdrop-blur p-4 shadow-lg">
            <p className="text-[11px] text-surface-400 mb-1">Your dashboard, at a glance</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-surface-400">Events live</p>
                <div className="h-2 w-14 rounded-full bg-brand-100 mt-1.5" />
              </div>
              <div>
                <p className="text-[11px] text-surface-400">Tickets sold</p>
                <div className="h-2 w-14 rounded-full bg-brand-100 mt-1.5" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-brand-600 text-sm font-semibold mb-2">For Organisers &amp; Promoters</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-4">
            Run events. Grow your community. Increase revenue.
          </h2>
          <p className="text-surface-500 leading-relaxed mb-6">
            Gala Dock gives organisers everything they need to create, promote and manage events —
            all in one powerful platform.
          </p>
          <ul className="space-y-3 mb-8">
            {[
              "Create and publish public event pages in minutes",
              "Custom branding and event pages",
              "Real-time sales reporting",
              "Payouts via Stripe Connect",
              "Tools for teams, venues and promoters",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" strokeWidth={2} />
                <span className="text-sm text-surface-600">{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-brand-600/20"
          >
            Start Selling Tickets
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function TrustStatsSection({ liveEventsCount, ticketsSold }: { liveEventsCount: number; ticketsSold: number }) {
  return (
    <section className="py-14 px-6 bg-white border-y border-surface-100">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-sm font-semibold text-surface-500 mb-8">Trusted by organisers. Loved by fans.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div>
            <p className="text-2xl font-bold text-surface-900"><StatValue value={liveEventsCount} /></p>
            <p className="text-xs text-surface-400 mt-1">Events live</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900"><StatValue value={ticketsSold} /></p>
            <p className="text-xs text-surface-400 mt-1">Tickets sold</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">GBP</p>
            <p className="text-xs text-surface-400 mt-1">Secure checkout via Stripe</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">24/7</p>
            <p className="text-xs text-surface-400 mt-1">Digital ticket delivery</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const WHY_CARDS = [
  { title: "All-in-one platform", desc: "Ticketing, promotion, check-in, analytics and more." },
  { title: "Secure & reliable", desc: "Payments processed securely through Stripe." },
  { title: "Transparent pricing", desc: "No hidden fees for organisers or fans." },
  { title: "Built for growth", desc: "Scales from a single event to a full events calendar." },
  { title: "Expert support", desc: "Real humans, fast responses. We're here to help." },
  { title: "Constantly improving", desc: "New features and integrations shipped regularly." },
];

function WhySection() {
  return (
    <section className="py-20 px-6 bg-surface-50">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-brand-600 text-sm font-semibold mb-2">Why Gala Dock</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-12">
          The most powerful event and ticketing platform
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          {WHY_CARDS.map((c) => (
            <div key={c.title} className="rounded-2xl border border-surface-200 bg-white p-6">
              <h3 className="font-semibold text-surface-900 text-sm mb-1.5">{c.title}</h3>
              <p className="text-sm text-surface-500 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-5xl mx-auto rounded-2xl bg-gradient-to-br from-brand-600 to-violet-700 px-8 py-12 sm:px-12">
        <div className="max-w-lg">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">Ready to create something amazing?</h2>
          <p className="text-brand-200 mb-8 leading-relaxed">
            Join organisers who trust Gala Dock to power their events, and fans who love the
            experience.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-brand-50 text-brand-700 font-semibold rounded-xl text-sm transition-colors shadow-lg"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/discover"
              className="flex items-center justify-center gap-2 px-6 py-3 border border-brand-400/50 hover:bg-brand-700/40 text-white font-medium rounded-xl text-sm transition-colors"
            >
              Explore Events
            </Link>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-brand-200">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> 14-day free trial</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> No credit card required</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Cancel anytime</span>
        </div>
      </div>
    </section>
  );
}

export async function EnabledHome() {
  const { featuredEvents, liveEventsCount, ticketsSold } = await loadHomeData();

  return (
    <>
      <HeroSection />
      <FeaturedEventsSection events={featuredEvents} />
      <CategorySection />
      <FanFeaturesSection />
      <OrganiserSection />
      <TrustStatsSection liveEventsCount={liveEventsCount} ticketsSold={ticketsSold} />
      <WhySection />
      <CtaSection />
    </>
  );
}
