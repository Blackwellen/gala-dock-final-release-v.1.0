"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Star, AlertTriangle, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpcomingEventCard } from "../data";
import { compactCurrency } from "../format";

// Matches the status palette used on the Events pipeline cards (EventsPipelineClient)
// so a card looks identical whether it's seen on Home or on the Events section.
const STATUS_STYLES: Record<string, string> = {
  new_enquiry: "bg-violet-50 text-violet-700",
  briefing: "bg-purple-50 text-purple-700",
  quoting: "bg-sky-50 text-sky-700",
  awaiting_approval: "bg-amber-50 text-amber-700",
  confirmed: "bg-green-50 text-green-700",
  in_delivery: "bg-emerald-50 text-emerald-700",
};

function statusLabel(status: string) {
  return status
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function EventCarousel({
  events,
  currency,
  locale,
}: {
  events: UpcomingEventCard[];
  currency: string;
  locale: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByCard(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-event-card]");
    const step = card ? card.offsetWidth + 16 : 214;
    el.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-10 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-3">
          <PartyPopper className="w-6 h-6 text-brand-400" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-semibold text-surface-900">No upcoming events</h3>
        <p className="mt-1.5 text-sm text-surface-500 max-w-sm">
          Events with a future start date will appear here as soon as they&apos;re scheduled.
        </p>
        <Link
          href="/event-manager/events/new"
          className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
        >
          Create an event
        </Link>
      </div>
    );
  }

  return (
    <div className="relative group/carousel">
      <div
        ref={scrollerRef}
        role="list"
        aria-label="Upcoming events"
        className="flex gap-4 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {events.map((e) => (
          <EventCarouselCard key={e.id} event={e} currency={currency} locale={locale} />
        ))}
      </div>

      {events.length > 3 && (
        <button
          type="button"
          onClick={() => scrollByCard(1)}
          aria-label="Scroll to next events"
          className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -right-3 w-9 h-9 rounded-full bg-white border border-surface-200 shadow-md items-center justify-center text-surface-500 hover:text-brand-600 hover:border-brand-300 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={2.2} />
        </button>
      )}
      {events.length > 3 && (
        <button
          type="button"
          onClick={() => scrollByCard(-1)}
          aria-label="Scroll to previous events"
          className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -left-3 w-9 h-9 rounded-full bg-white border border-surface-200 shadow-md items-center justify-center text-surface-500 hover:text-brand-600 hover:border-brand-300 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function EventCarouselCard({ event, currency, locale }: { event: UpcomingEventCard; currency: string; locale: string }) {
  const statusClass = STATUS_STYLES[event.status] ?? "bg-surface-100 text-surface-600 border-surface-200";
  const router = useRouter();
  return (
    <Link
      href={`/event-manager/events/${event.id}`}
      data-event-card
      role="listitem"
      className="group/card snap-start shrink-0 w-[210px] bg-white rounded-xl border border-surface-200 shadow-card hover:shadow-md transition-shadow overflow-hidden flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="relative h-[110px] w-full bg-gradient-to-br from-brand-600 to-brand-800 overflow-hidden shrink-0">
        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverImageUrl}
            alt={event.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PartyPopper className="w-8 h-8 text-white/30" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute top-2 left-2 bg-white/95 backdrop-blur rounded-md px-1.5 py-0.5 text-center leading-none shadow-sm">
          <p className="text-[8px] font-bold text-brand-600 tracking-wide">{event.month}</p>
          <p className="text-[13px] font-bold text-surface-900">{event.day}</p>
        </div>
        {event.isVip && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-sm">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
          </div>
        )}
        {!event.isVip && (event.riskLevel === "high" || event.riskLevel === "critical") && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-sm" title="At risk">
            <AlertTriangle className="w-3 h-3 text-danger-500" />
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h3 className="font-semibold text-surface-900 text-[13px] leading-tight line-clamp-1 min-w-0">{event.name}</h3>

        <div className="flex items-center gap-1 text-[11px] text-surface-500 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" strokeWidth={1.8} />
          <span className="truncate">{event.venue ?? "Location TBC"}</span>
          <span className={cn("ml-auto shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap", statusClass)}>
            {statusLabel(event.status)}
          </span>
        </div>

        <div className="mt-auto pt-1.5 flex items-end justify-between gap-1">
          <div className="flex items-end gap-3">
            <div className="leading-tight">
              <p className="text-sm font-bold text-surface-900 tabular-nums">{event.guestCount.toLocaleString(locale)}</p>
              <p className="text-[10px] text-surface-400">Guests</p>
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-surface-900 tabular-nums">
                {event.valueCents > 0 ? compactCurrency(event.valueCents, currency, locale) : "TBC"}
              </p>
              <p className="text-[10px] text-surface-400">Est. Value</p>
            </div>
          </div>
          <button
            type="button"
            onClick={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              router.push(`/event-manager/events/${event.id}/schedule`);
            }}
            aria-label={`Open ${event.name} on the calendar`}
            className="w-6 h-6 rounded-md bg-surface-100 flex items-center justify-center shrink-0 text-surface-500 hover:bg-brand-50 hover:text-brand-600 transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </Link>
  );
}
