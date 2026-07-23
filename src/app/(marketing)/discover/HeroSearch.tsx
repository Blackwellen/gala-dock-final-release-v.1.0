"use client";

import { useRef, useState } from "react";
import { Search, MapPin, LocateFixed, CalendarRange } from "lucide-react";

/**
 * Premium unified search card: query + location + dates in one elevated control, plus a real
 * "Near me" button (browser geolocation → lat/lng hidden fields). Distance is computed
 * server-side in page.tsx against each event's real venue latitude/longitude — no fake proximity.
 * Still a plain <form method="get">, so it degrades to normal navigation without JS.
 */
export function HeroSearch({
  q,
  city,
  from,
  to,
  view,
  sort,
  cityOptions,
}: {
  q: string;
  city: string;
  from: string;
  to: string;
  view: string;
  sort: string;
  cityOptions: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        formRef.current?.requestSubmit();
      },
      () => {
        setLocating(false);
        setLocError("Couldn't get your location — check browser permissions.");
      },
      { timeout: 8000 }
    );
  }

  return (
    <form ref={formRef} method="get" action="/discover" className="mt-6">
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="sort" value={coords ? "distance" : sort} />
      {coords && (
        <>
          <input type="hidden" name="lat" value={coords.lat} />
          <input type="hidden" name="lng" value={coords.lng} />
        </>
      )}

      <div className="flex flex-col divide-y divide-surface-100 overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] sm:flex-row sm:divide-x sm:divide-y-0">
        <div className="relative flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-surface-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search events, artists, venues or organisers…"
            className="w-full bg-transparent text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none"
          />
        </div>

        <div className="relative flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3.5 sm:max-w-[220px]">
          <MapPin className="h-4 w-4 shrink-0 text-surface-400" />
          <input
            type="text"
            name="city"
            list="discover-city-options"
            defaultValue={city}
            placeholder="City or area"
            className="w-full min-w-0 bg-transparent text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none"
          />
          <datalist id="discover-city-options">
            {cityOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            title="Search near my current location"
            className="shrink-0 rounded-full p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50"
          >
            <LocateFixed className={locating ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
          </button>
        </div>

        <div className="relative flex shrink-0 items-center gap-2 px-4 py-3.5">
          <CalendarRange className="h-4 w-4 shrink-0 text-surface-400" />
          <input
            type="date"
            name="from"
            defaultValue={from}
            aria-label="From date"
            className="w-[126px] shrink-0 bg-transparent text-sm text-surface-900 focus:outline-none"
          />
          <span className="shrink-0 text-surface-300">–</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            aria-label="To date"
            className="w-[126px] shrink-0 bg-transparent text-sm text-surface-900 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="flex shrink-0 items-center justify-center gap-2 bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <Search className="h-4 w-4" /> Search
        </button>
      </div>

      {(locError || coords) && (
        <p className="mt-2 text-xs text-surface-400">
          {locError ?? "Searching near your current location — sorted by distance to the venue."}
        </p>
      )}
    </form>
  );
}
