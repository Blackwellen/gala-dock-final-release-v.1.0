import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarDays,
  Clock,
  MapPin,
  ShieldCheck,
  Zap,
  Sparkles,
  HelpCircle,
  Accessibility as AccessibilityIcon,
  Undo2,
  DoorOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { r2PublicUrl } from "@/lib/storage/r2";
import { cn, formatCurrency } from "@/lib/utils";
import { RegisterForm } from "./RegisterForm";
import { ShareButton } from "./ShareButton";
import { FavouriteButton } from "./FavouriteButton";
import { type TicketTier } from "@/components/public-commerce/TicketTierList";
import { TicketTierPreview } from "./TicketTierPreview";
import { SeatingPreview, type SeatingSection } from "@/components/public-commerce/SeatingPreview";
import { VenueMapPreview } from "@/components/public-commerce/VenueMapPreview";
import { PublicEventCard, type PublicEventCardData } from "@/components/public-commerce/PublicEventCard";

export const dynamic = "force-dynamic";

// EB-L: public event profile page. Every section reads from event_public_pages (organiser-authored,
// anon-readable via RLS while published = true) or ticket_types (real inventory). Optional jsonb
// content (lineup/gallery/schedule/accessibility/policies/faqs) is hidden entirely when empty —
// never backfilled with placeholder copy.

interface LineupItem {
  name: string;
  role?: string;
  photoUrl?: string;
  stage?: string;
  startsAt?: string;
}
interface ScheduleItem {
  time: string;
  title: string;
  description?: string;
}
interface FaqItem {
  question: string;
  answer: string;
}
interface Policies {
  ageRestriction?: string;
  refundPolicy?: string;
  reEntry?: string;
  bagPolicy?: string;
  lastEntry?: string;
}

function asArray<T>(json: unknown): T[] {
  return Array.isArray(json) ? (json as T[]) : [];
}
function asObject<T>(json: unknown): T {
  return (json && typeof json === "object" && !Array.isArray(json) ? (json as T) : ({} as T));
}

function fmtFullDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("event_public_pages")
    .select("seo_title, seo_description, headline, hero_path")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) return { title: "Event" };
  const heroUrl = r2PublicUrl(page.hero_path);
  const title = page.seo_title ?? page.headline ?? "Event";
  const description = page.seo_description ?? undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: heroUrl ? [{ url: heroUrl }] : undefined,
    },
  };
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("event_public_pages")
    .select(
      "event_id, workspace_id, headline, summary, hero_path, slug, category, event_type, city, country, starts_at, ends_at, doors_at, venue_name, address_line1, latitude, longitude, gallery_paths, lineup, schedule, accessibility_features, policies, faqs, age_restriction, organiser_name, promoted"
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) notFound();

  const [{ data: tickets }, { data: workspaceRow }, {
    data: { user },
  }] = await Promise.all([
    supabase
      .from("ticket_types")
      .select("id, name, description, price_cents, currency, quantity, sold, status")
      .eq("event_id", page.event_id)
      .eq("status", "on_sale")
      .order("price_cents", { ascending: true }),
    supabase.from("workspaces").select("name").eq("id", page.workspace_id).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  let favourited = false;
  if (user) {
    const { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
    if (customer) {
      const { data: fav } = await supabase
        .from("event_favourites")
        .select("id")
        .eq("event_id", page.event_id)
        .eq("customer_id", customer.id)
        .maybeSingle();
      favourited = Boolean(fav);
    }
  }

  // Similar events: same category, published, excluding this one.
  let similar: PublicEventCardData[] = [];
  if (page.category) {
    const { data: similarPages } = await supabase
      .from("event_public_pages")
      .select("event_id, slug, headline, category, event_type, starts_at, doors_at, venue_name, city, hero_path, promoted")
      .eq("published", true)
      .eq("category", page.category)
      .neq("event_id", page.event_id)
      .limit(4);

    if (similarPages?.length) {
      const eventIds = similarPages.map((p) => p.event_id);
      const { data: similarTickets } = await supabase
        .from("ticket_types")
        .select("event_id, price_cents, currency")
        .in("event_id", eventIds)
        .eq("status", "on_sale");

      const minPriceByEvent = new Map<string, { price_cents: number; currency: string }>();
      for (const t of similarTickets ?? []) {
        const existing = minPriceByEvent.get(t.event_id);
        if (!existing || t.price_cents < existing.price_cents) {
          minPriceByEvent.set(t.event_id, { price_cents: t.price_cents, currency: t.currency });
        }
      }

      similar = similarPages.map((p) => {
        const price = minPriceByEvent.get(p.event_id);
        return {
          slug: p.slug,
          headline: p.headline ?? "Event",
          category: p.category,
          eventType: p.event_type,
          startsAt: p.starts_at,
          doorsAt: p.doors_at,
          venueName: p.venue_name,
          city: p.city,
          fromPriceCents: price?.price_cents ?? null,
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
    }
  }

  const heroUrl = r2PublicUrl(page.hero_path);
  const galleryUrls = asArray<string>(page.gallery_paths).map((p) => r2PublicUrl(p)).filter((u): u is string => Boolean(u));
  const lineup = asArray<LineupItem>(page.lineup);
  const schedule = asArray<ScheduleItem>(page.schedule);
  const faqs = asArray<FaqItem>(page.faqs);
  const accessibilityFeatures = asArray<string>(page.accessibility_features);
  const policies = asObject<Policies>(page.policies);

  const tierList = tickets ?? [];
  const currency = tierList[0]?.currency ?? "GBP";
  const fromPriceCents = tierList.length ? Math.min(...tierList.map((t) => t.price_cents)) : null;
  const totalSold = tierList.reduce((sum, t) => sum + (t.sold ?? 0), 0);
  const totalRemaining = tierList.length
    ? tierList.reduce((sum, t) => sum + (t.quantity != null ? Math.max(0, t.quantity - t.sold) : 0), 0)
    : null;

  const tiers: TicketTier[] = tierList.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    priceCents: t.price_cents,
    currency: t.currency,
    remaining: t.quantity != null ? Math.max(0, t.quantity - t.sold) : null,
    soldOut: t.quantity != null ? t.quantity - t.sold <= 0 : false,
  }));

  const sections: SeatingSection[] = tierList.map((t) => ({
    id: t.id,
    name: t.name,
    remaining: t.quantity != null ? Math.max(0, t.quantity - t.sold) : null,
    capacity: t.quantity,
    priceCents: t.price_cents,
  }));

  const organiserName = page.organiser_name ?? workspaceRow?.name ?? null;
  const hasVenue = Boolean(page.venue_name || page.address_line1 || (page.latitude != null && page.longitude != null));
  const policyEntries: Array<{ key: keyof Policies; label: string; icon: typeof Undo2 }> = [
    { key: "reEntry", label: "Re-entry Policy", icon: DoorOpen },
    { key: "bagPolicy", label: "Bag Policy", icon: ShieldCheck },
    { key: "lastEntry", label: "Last Entry", icon: Clock },
    { key: "refundPolicy", label: "Refund Policy", icon: Undo2 },
  ];
  const activePolicies = policyEntries.filter((p) => policies[p.key]);
  const ageRestriction = page.age_restriction ?? policies.ageRestriction ?? null;
  const hasInfoRow = Boolean(
    accessibilityFeatures.length || ageRestriction || activePolicies.length || faqs.length || organiserName
  );

  const tabs = [
    { id: "about", label: "About", show: Boolean(page.summary) },
    { id: "lineup", label: "Lineup", show: lineup.length > 0 },
    { id: "gallery", label: "Gallery", show: galleryUrls.length > 0 },
    { id: "schedule", label: "Schedule", show: schedule.length > 0 },
    { id: "tickets", label: "Tickets", show: true },
    { id: "venue", label: "Venue", show: hasVenue },
    { id: "info", label: "Info", show: hasInfoRow },
    { id: "faqs", label: "FAQs", show: faqs.length > 0 },
  ].filter((t) => t.show);

  const badges = [page.category, page.event_type].filter((v): v is string => Boolean(v));
  const dateLabel = fmtFullDate(page.starts_at);
  const timeLabel = fmtTime(page.starts_at);
  const endTimeLabel = fmtTime(page.ends_at);
  const venueLine = [page.venue_name, page.city].filter(Boolean).join(", ");

  const hasSideCards = lineup.length > 0 || schedule.length > 0;

  return (
    <div className="bg-surface-50">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-indigo-800 to-purple-900 text-white">
        {heroUrl && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroUrl} alt="" className="h-full w-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
          </div>
        )}
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-8 pb-24">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {heroUrl && (
              <div className="hidden sm:block h-40 w-32 shrink-0 overflow-hidden rounded-xl border border-white/20 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroUrl} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {badges.map((b) => (
                  <span key={b} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur-sm">
                    {b}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight">{page.headline ?? "Event"}</h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
                {dateLabel && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" /> {dateLabel}
                  </span>
                )}
                {timeLabel && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> {timeLabel}
                    {endTimeLabel ? ` – ${endTimeLabel}` : ""}
                  </span>
                )}
                {venueLine && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {venueLine}
                  </span>
                )}
              </div>

              {page.summary && (
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/80">
                  {page.summary.length > 220 ? `${page.summary.slice(0, 220).trimEnd()}…` : page.summary}
                </p>
              )}

              {organiserName && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20 text-[11px] font-semibold text-white backdrop-blur-sm">
                    {organiserName.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="text-sm text-white/70">
                    Hosted by <span className="font-semibold text-white">{organiserName}</span>
                  </p>
                </div>
              )}

              {/* Real stat chips only — no fabricated ratings/reviews/recommend %, those have no
                  backing table yet (see docs/release-gated/user-fixes/public-event-commerce.md) */}
              {(totalSold > 0 || totalRemaining != null) && (
                <div className="mt-5 flex flex-wrap gap-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  {totalSold > 0 && (
                    <div>
                      <p className="text-lg font-bold leading-none text-white">{totalSold.toLocaleString()}</p>
                      <p className="mt-1 text-[11px] text-white/70">Tickets sold</p>
                    </div>
                  )}
                  {totalRemaining != null && (
                    <div>
                      <p className="text-lg font-bold leading-none text-white">{totalRemaining.toLocaleString()}</p>
                      <p className="mt-1 text-[11px] text-white/70">Tickets remaining</p>
                    </div>
                  )}
                  {tiers.length > 0 && (
                    <div>
                      <p className="text-lg font-bold leading-none text-white">{tiers.length}</p>
                      <p className="mt-1 text-[11px] text-white/70">Ticket type{tiers.length > 1 ? "s" : ""}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
              <div className="flex gap-2">
                <ShareButton title={page.headline ?? "Event"} text={page.summary ?? undefined} />
                <FavouriteButton slug={slug} initial={favourited} />
              </div>
              <Link
                href={`/e/${slug}/tickets`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
              >
                <Zap className="h-4 w-4" /> Get Tickets
              </Link>
            </div>
          </div>
        </div>

        {/* Sticky in-page tab nav */}
        {tabs.length > 0 && (
          <div className="sticky top-0 z-20 border-t border-white/10 bg-black/30 backdrop-blur-md">
            <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 scrollbar-hide">
              {tabs.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  {t.label}
                </a>
              ))}
            </nav>
          </div>
        )}
      </section>

      {/* ---------- Content ---------- */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main column */}
          <div className="lg:col-span-9 space-y-6">
            {/* Row 1: Lineup / Gallery + About / Schedule */}
            <div className={cn("grid grid-cols-1 gap-6", hasSideCards && "lg:grid-cols-12")}>
              {lineup.length > 0 && (
                <div id="lineup" className="lg:col-span-3 rounded-2xl border border-surface-200 bg-white p-5 scroll-mt-24">
                  <h2 className="text-sm font-semibold text-surface-900">Featured Lineup</h2>
                  <ul className="mt-4 space-y-3.5">
                    {lineup.map((l, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-xs font-semibold text-white">
                          {l.name?.slice(0, 1).toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-surface-900 truncate">{l.name}</p>
                          {l.role && <p className="text-xs text-surface-500 truncate">{l.role}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={cn("space-y-6", hasSideCards ? "lg:col-span-6" : "lg:col-span-8")}>
                {galleryUrls.length > 0 && (
                  <div id="gallery" className="rounded-2xl border border-surface-200 bg-white p-5 scroll-mt-24">
                    <h2 className="text-sm font-semibold text-surface-900">Gallery</h2>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {galleryUrls.slice(0, 4).map((url, i) => (
                        <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-surface-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </div>
                      ))}
                      {galleryUrls.length > 4 && (
                        <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-900/90">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={galleryUrls[4]} alt="" className="h-full w-full object-cover opacity-40" />
                          <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-white">
                            +{galleryUrls.length - 4} more
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {page.summary && (
                  <div id="about" className="rounded-2xl border border-surface-200 bg-white p-5 scroll-mt-24">
                    <h2 className="text-sm font-semibold text-surface-900">About This Event</h2>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-surface-600">{page.summary}</p>
                  </div>
                )}
              </div>

              {schedule.length > 0 && (
                <div id="schedule" className="lg:col-span-3 rounded-2xl border border-surface-200 bg-white p-5 scroll-mt-24">
                  <h2 className="text-sm font-semibold text-surface-900">Schedule</h2>
                  <ol className="mt-4 space-y-4 border-l border-surface-200 pl-4">
                    {schedule.map((s, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                        <p className="text-xs font-semibold text-surface-900">{s.time}</p>
                        <p className="text-sm font-medium text-surface-800">{s.title}</p>
                        {s.description && <p className="text-xs text-surface-500">{s.description}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Row 2: Tickets / Seating / Venue */}
            <div id="tickets" className="grid grid-cols-1 lg:grid-cols-12 gap-6 scroll-mt-24">
              <div className="lg:col-span-5 rounded-2xl border border-surface-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-surface-900">Ticket Tiers</h2>
                <div className="mt-4">
                  {tiers.length > 0 ? (
                    <TicketTierPreview tiers={tiers} />
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-surface-200 bg-surface-50 p-6 text-center text-sm text-surface-500">
                        Tickets aren&apos;t on sale yet — register your interest and we&apos;ll let you know.
                      </div>
                      <RegisterForm eventId={page.event_id} workspaceId={page.workspace_id} />
                    </div>
                  )}
                </div>
                {tiers.length > 0 && (
                  <Link
                    href={`/e/${slug}/tickets`}
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    Get Tickets
                  </Link>
                )}
              </div>

              <div className="lg:col-span-3 rounded-2xl border border-surface-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-surface-900">Seating Preview</h2>
                <div className="mt-4">
                  <SeatingPreview sections={sections} compact />
                </div>
              </div>

              {hasVenue && (
                <div id="venue" className="lg:col-span-4 space-y-4 scroll-mt-24">
                  <VenueMapPreview
                    venueName={page.venue_name}
                    addressLine1={page.address_line1}
                    city={page.city}
                    latitude={page.latitude}
                    longitude={page.longitude}
                  />
                  {(page.venue_name || page.address_line1) && (
                    <div className="rounded-xl border border-surface-200 bg-white p-4">
                      <h3 className="text-sm font-semibold text-surface-900">Venue Details</h3>
                      {page.venue_name && <p className="mt-1.5 text-sm text-surface-700">{page.venue_name}</p>}
                      {(page.address_line1 || page.city || page.country) && (
                        <p className="text-xs text-surface-500">
                          {[page.address_line1, page.city, page.country].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Row 3: Similar Events */}
            {similar.length > 0 && (
              <div className="rounded-2xl border border-surface-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-surface-900">Similar Events</h2>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {similar.map((e) => (
                    <PublicEventCard key={e.slug} event={e} variant="compact" />
                  ))}
                </div>
              </div>
            )}

            {/* Row 4: Info grid */}
            {hasInfoRow && (
              <div id="info" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 scroll-mt-24">
                {accessibilityFeatures.length > 0 && (
                  <div className="rounded-xl border border-surface-200 bg-white p-4">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-surface-900">
                      <AccessibilityIcon className="h-4 w-4 text-brand-600" /> Accessibility
                    </h3>
                    <ul className="mt-2 space-y-1 text-xs text-surface-500">
                      {accessibilityFeatures.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {ageRestriction && (
                  <div className="rounded-xl border border-surface-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-surface-900">Age Restriction</h3>
                    <p className="mt-2 text-xs text-surface-500">{ageRestriction}</p>
                  </div>
                )}

                {activePolicies.map((p) => (
                  <div key={p.key} className="rounded-xl border border-surface-200 bg-white p-4">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-surface-900">
                      <p.icon className="h-4 w-4 text-brand-600" /> {p.label}
                    </h3>
                    <p className="mt-2 text-xs text-surface-500">{policies[p.key]}</p>
                  </div>
                ))}

                {faqs.length > 0 && (
                  <div id="faqs" className="rounded-xl border border-surface-200 bg-white p-4 scroll-mt-24">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-surface-900">
                      <HelpCircle className="h-4 w-4 text-brand-600" /> FAQs
                    </h3>
                    <dl className="mt-2 space-y-3">
                      {faqs.map((f, i) => (
                        <div key={i}>
                          <dt className="text-xs font-semibold text-surface-800">{f.question}</dt>
                          <dd className="mt-0.5 text-xs text-surface-500">{f.answer}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {organiserName && (
                  <div className="rounded-xl border border-surface-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-surface-900">Hosted By</h3>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-xs font-semibold text-white">
                        {organiserName.slice(0, 1).toUpperCase()}
                      </div>
                      <p className="text-sm font-medium text-surface-800">{organiserName}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right rail — sticky order summary (desktop only) */}
          <div className="hidden lg:block lg:col-span-3">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-surface-900">Your Order</h2>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-600 to-indigo-700">
                    {heroUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-surface-900">{page.headline}</p>
                    <p className="text-xs text-surface-500">{dateLabel}{timeLabel ? ` · ${timeLabel}` : ""}</p>
                    {venueLine && <p className="truncate text-xs text-surface-400">{venueLine}</p>}
                  </div>
                </div>

                <div className="mt-4 border-t border-surface-100 pt-4">
                  {fromPriceCents != null ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-surface-500">From</span>
                      <span className="font-semibold text-surface-900">{formatCurrency(fromPriceCents / 100, currency)}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-surface-400">Tickets not yet on sale</p>
                  )}
                </div>

                <Link
                  href={`/e/${slug}/tickets`}
                  className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Get Tickets
                </Link>

                <div className="mt-4 space-y-2 border-t border-surface-100 pt-4">
                  <p className="flex items-center gap-1.5 text-[11px] text-surface-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-success-600" /> Secure checkout · your data is protected
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-surface-500">
                    <Zap className="h-3.5 w-3.5 text-success-600" /> Instant delivery · mobile tickets ready
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-surface-500">
                    <Sparkles className="h-3.5 w-3.5 text-success-600" /> No hidden fees · transparent pricing
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-surface-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-surface-500">{page.headline}</p>
          {fromPriceCents != null ? (
            <p className="text-sm font-semibold text-surface-900">From {formatCurrency(fromPriceCents / 100, currency)}</p>
          ) : (
            <p className="text-sm font-semibold text-surface-900">Register interest</p>
          )}
        </div>
        <Link
          href={`/e/${slug}/tickets`}
          className="shrink-0 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Get Tickets
        </Link>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}
