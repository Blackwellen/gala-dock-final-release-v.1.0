"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Heart, MapPin, Star, Sparkles } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toggleFavourite } from "@/app/(marketing)/discover/actions";

export interface PublicEventCardData {
  slug: string;
  headline: string;
  category: string | null;
  eventType: string | null;
  startsAt: string | null;
  doorsAt: string | null;
  venueName: string | null;
  city: string | null;
  fromPriceCents: number | null;
  currency: string;
  heroUrl: string | null;
  promoted: boolean;
  soldOut: boolean;
  lowAvailability: boolean;
  ratingAvg: number | null;
  ratingCount: number | null;
  ticketsSold: number | null;
  favourited?: boolean;
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}
function fmtDay(d: string | null) {
  if (!d) return "TBC";
  return new Date(d).getDate().toString().padStart(2, "0");
}
function fmtMonth(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
}
function fmtTime(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

function FavouriteButton({ slug, initial }: { slug: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={on ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOn((v) => !v);
        start(async () => {
          const res = await toggleFavourite(slug);
          if (!res.ok) setOn((v) => !v); // revert on failure (e.g. not logged in)
        });
      }}
      disabled={pending}
      className={cn(
        "absolute top-3 right-3 z-10 grid place-items-center h-8 w-8 rounded-full backdrop-blur-md transition-colors",
        on ? "bg-white text-danger-600" : "bg-black/30 text-white hover:bg-black/50"
      )}
    >
      <Heart className={cn("w-4 h-4", on && "fill-current")} strokeWidth={2} />
    </button>
  );
}

/**
 * Flagship public event discovery card. variant controls density/orientation for the
 * different surfaces (grid, promoted rail, map result popover, similar-events strip).
 */
export function PublicEventCard({
  event,
  variant = "grid",
  className,
}: {
  event: PublicEventCardData;
  variant?: "grid" | "compact" | "horizontal" | "map" | "mini";
  className?: string;
}) {
  const href = `/e/${event.slug}`;
  const mediaGradient = "bg-gradient-to-br from-brand-600 via-indigo-600 to-purple-700";

  if (variant === "horizontal") {
    return (
      <Link
        href={href}
        className={cn(
          "group flex gap-4 rounded-xl border border-surface-200 bg-white p-3 hover:border-brand-300 hover:shadow-md transition-all",
          className
        )}
      >
        <div className={cn("relative h-20 w-28 shrink-0 rounded-lg overflow-hidden", mediaGradient)}>
          {event.heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-brand-600">
            {event.category && <span>{event.category.toUpperCase()}</span>}
          </div>
          <h3 className="mt-0.5 font-semibold text-surface-900 text-sm truncate group-hover:text-brand-700">
            {event.headline}
          </h3>
          <p className="mt-0.5 text-xs text-surface-500">
            {fmtDate(event.startsAt)}{fmtTime(event.startsAt) ? ` · ${fmtTime(event.startsAt)}` : ""}
          </p>
          {event.venueName && <p className="text-xs text-surface-400 truncate">{event.venueName}</p>}
        </div>
        <div className="shrink-0 text-right self-center">
          {event.fromPriceCents != null && (
            <p className="text-sm font-semibold text-surface-900">
              From {formatCurrency(event.fromPriceCents / 100, event.currency)}
            </p>
          )}
          {event.ratingAvg != null && (
            <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-surface-500">
              <Star className="w-3 h-3 fill-warning-400 text-warning-400" /> {event.ratingAvg.toFixed(1)}
            </p>
          )}
        </div>
      </Link>
    );
  }

  if (variant === "mini" || variant === "map") {
    return (
      <Link
        href={href}
        className={cn(
          "group block w-64 rounded-xl border border-surface-200 bg-white overflow-hidden shadow-lg hover:shadow-xl transition-shadow",
          className
        )}
      >
        <div className={cn("relative h-24", mediaGradient)}>
          {event.heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <div className="p-3">
          <h3 className="text-sm font-semibold text-surface-900 truncate">{event.headline}</h3>
          <p className="mt-0.5 text-xs text-surface-500">{fmtDate(event.startsAt)}</p>
          {event.fromPriceCents != null && (
            <p className="mt-1 text-xs font-semibold text-brand-700">
              From {formatCurrency(event.fromPriceCents / 100, event.currency)}
            </p>
          )}
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        href={href}
        className={cn(
          "group relative block rounded-xl overflow-hidden border border-surface-200 bg-white hover:shadow-md transition-shadow",
          className
        )}
      >
        <div className={cn("relative h-28", mediaGradient)}>
          {event.heroUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <span className="absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {event.category ?? "Event"}
          </span>
        </div>
        <div className="p-3">
          <h3 className="text-sm font-semibold text-surface-900 line-clamp-1">{event.headline}</h3>
          <p className="mt-0.5 text-xs text-surface-500">
            {fmtDate(event.startsAt)}
            {fmtTime(event.startsAt) ? ` · ${fmtTime(event.startsAt)}` : ""}
          </p>
          {event.venueName && <p className="text-xs text-surface-400 truncate">{event.venueName}</p>}
          <div className="mt-1.5 flex items-center justify-between">
            {event.fromPriceCents != null ? (
              <p className="text-xs font-semibold text-surface-900">
                From {formatCurrency(event.fromPriceCents / 100, event.currency)}
              </p>
            ) : <span />}
            {event.ratingAvg != null && (
              <p className="flex items-center gap-1 text-[11px] text-surface-500">
                <Star className="w-3 h-3 fill-warning-400 text-warning-400" /> {event.ratingAvg.toFixed(1)}
              </p>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // grid (flagship / default)
  return (
    <Link
      href={href}
      className={cn(
        "group relative block rounded-2xl overflow-hidden border border-surface-200 bg-white hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200",
        className
      )}
    >
      <div className={cn("relative aspect-[4/3] overflow-hidden", mediaGradient)}>
        {event.heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />

        {event.promoted && (
          <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-warning-400 px-2.5 py-1 text-[11px] font-semibold text-warning-950">
            <Sparkles className="w-3 h-3" /> Promoted
          </span>
        )}
        <FavouriteButton slug={event.slug} initial={Boolean(event.favourited)} />

        {event.category && (
          <span className="absolute top-3 right-14 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-surface-800">
            {event.category}
          </span>
        )}

        {/* Date chip */}
        <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-white px-2.5 py-1.5 text-center leading-none shadow">
          <p className="text-[10px] font-semibold text-danger-600">{fmtMonth(event.startsAt)}</p>
          <p className="text-lg font-bold text-surface-900">{fmtDay(event.startsAt)}</p>
        </div>

        {event.fromPriceCents != null && (
          <div className="absolute bottom-3 right-3 z-10 text-right text-white">
            <p className="text-[10px] opacity-80">From</p>
            <p className="text-sm font-bold">{formatCurrency(event.fromPriceCents / 100, event.currency)}</p>
          </div>
        )}

        {event.soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-surface-900">Sold out</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-surface-900 text-sm leading-snug line-clamp-2 group-hover:text-brand-700 transition-colors">
          {event.headline}
        </h3>
        <p className="mt-1.5 text-xs text-surface-500">
          {fmtDate(event.startsAt)}
          {fmtTime(event.startsAt) ? ` · ${fmtTime(event.startsAt)}` : ""}
        </p>
        {(event.venueName || event.city) && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-surface-400 truncate">
            <MapPin className="w-3 h-3 shrink-0" /> {[event.venueName, event.city].filter(Boolean).join(", ")}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          {event.ratingAvg != null ? (
            <span className="flex items-center gap-1 text-xs text-surface-500">
              <Star className="w-3.5 h-3.5 fill-warning-400 text-warning-400" />
              {event.ratingAvg.toFixed(1)}
              {event.ratingCount != null && <span className="text-surface-400">({event.ratingCount})</span>}
            </span>
          ) : <span />}
          {event.lowAvailability && !event.soldOut && (
            <span className="text-[11px] font-medium text-danger-600">Selling fast</span>
          )}
        </div>
      </div>
    </Link>
  );
}
