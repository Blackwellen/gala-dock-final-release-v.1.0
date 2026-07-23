"use client";

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";

interface EventMapClientProps {
  lat: number;
  lng: number;
  zoom?: number;
  venueName?: string;
  venueAddress?: string;
  className?: string;
  apiKey?: string;
}

export function EventMapClient({
  lat,
  lng,
  zoom = 15,
  venueName,
  venueAddress,
  className = "w-full h-full",
  apiKey,
}: EventMapClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!apiKey) return; // no key — render fallback

    let mounted = true;

    (async () => {
      try {
        const { Map, Marker, config } = await import("@maptiler/sdk");
        if (!mounted || !containerRef.current) return;

        config.apiKey = apiKey;

        const map = new Map({
          container: containerRef.current,
          style: "streets-v2",
          center: [lng, lat],
          zoom,
          attributionControl: { compact: true },
        });

        mapRef.current = map;

        map.on("load", () => {
          if (!mounted) return;
          new Marker({ color: "#4f46e5" })
            .setLngLat([lng, lat])
            .addTo(map);
        });
      } catch {
        // MapTiler unavailable — fallback renders in JSX below
      }
    })();

    return () => {
      mounted = false;
      if (mapRef.current) {
        try {
          (mapRef.current as { remove: () => void }).remove();
        } catch {
          // ignore
        }
        mapRef.current = null;
      }
    };
  }, [lat, lng, zoom, apiKey]);

  if (!apiKey) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-gradient-to-br from-surface-50 to-surface-100 border border-surface-200 rounded-xl`}>
        <MapPin className="h-8 w-8 text-surface-300 mb-2" strokeWidth={1.5} />
        <p className="text-xs font-semibold text-surface-500">{venueName ?? "Venue"}</p>
        {venueAddress && (
          <p className="text-[10px] text-surface-400 mt-0.5 text-center px-4">{venueAddress}</p>
        )}
        <p className="text-[9px] text-surface-300 mt-2">
          Add <code className="bg-surface-100 px-1 rounded">NEXT_PUBLIC_MAPTILER_KEY</code> to enable map
        </p>
      </div>
    );
  }

  return (
    <div className={`${className} relative`}>
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />
    </div>
  );
}

/* ── Static map image (server-safe, no JS needed) ─────────────────────────── */
export function StaticVenueMap({
  lat,
  lng,
  zoom = 14,
  width = 400,
  height = 200,
  apiKey,
  venueName,
  venueAddress,
  className = "w-full h-full",
}: {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
  apiKey?: string;
  venueName?: string;
  venueAddress?: string;
  className?: string;
}) {
  if (!apiKey) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-gradient-to-br from-surface-50 to-surface-100 border border-surface-200 rounded-xl`}>
        <MapPin className="h-6 w-6 text-surface-300 mb-1.5" strokeWidth={1.5} />
        <p className="text-[11px] font-semibold text-surface-500">{venueName ?? "Venue"}</p>
        {venueAddress && (
          <p className="text-[9px] text-surface-400 mt-0.5 text-center px-2">{venueAddress}</p>
        )}
      </div>
    );
  }

  const pinUrl = encodeURIComponent(`pin-l+4f46e5(${lng},${lat})`);
  const src = `https://api.maptiler.com/maps/streets-v2/static/${lng},${lat},${zoom}/${width}x${height}.png?key=${apiKey}&markers=${pinUrl}&attribution=false`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={venueName ?? "Venue map"}
      width={width}
      height={height}
      className={`${className} object-cover rounded-xl`}
    />
  );
}
