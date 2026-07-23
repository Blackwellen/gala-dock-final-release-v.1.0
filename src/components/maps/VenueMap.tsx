"use client";

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";

interface VenueMapProps {
  venueName: string;
  venueAddress: string;
  lat?: number;
  lng?: number;
  className?: string;
}

// Default London coordinates when no venue coords available
const DEFAULT_LAT = 51.5074;
const DEFAULT_LNG = -0.1278;
const DEFAULT_ZOOM = 14;

export function VenueMap({
  venueName,
  venueAddress,
  lat = DEFAULT_LAT,
  lng = DEFAULT_LNG,
  className = "h-[360px] w-full rounded-xl overflow-hidden",
}: VenueMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!apiKey) return;

    let map: unknown;
    let cancelled = false;

    async function initMap() {
      try {
        const maptilersdk = await import("@maptiler/sdk");
        // CSS must be added once; safe to re-add (browser deduplicates)
        if (!document.getElementById("maptiler-css")) {
          const link = document.createElement("link");
          link.id = "maptiler-css";
          link.rel = "stylesheet";
          link.href = "https://cdn.maptiler.com/maptiler-sdk-js/latest/maptiler-sdk.css";
          document.head.appendChild(link);
        }

        if (cancelled || !mapRef.current) return;

        maptilersdk.config.apiKey = apiKey!;

        map = new maptilersdk.Map({
          container: mapRef.current!,
          style: maptilersdk.MapStyle.STREETS,
          center: [lng, lat],
          zoom: DEFAULT_ZOOM,
        });

        mapInstanceRef.current = map;

        (map as InstanceType<typeof maptilersdk.Map>).on("load", () => {
          if (cancelled) return;
          // Add venue marker
          const el = document.createElement("div");
          el.className = "venue-marker";
          el.style.cssText = `
            width: 36px; height: 36px;
            background: #4f46e5; border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(79,70,229,0.4);
            cursor: pointer;
          `;

          new maptilersdk.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(
              new maptilersdk.Popup({ offset: 20 }).setHTML(
                `<div style="font-family:sans-serif;padding:4px 2px;">
                  <strong style="font-size:13px;display:block;margin-bottom:2px;">${venueName}</strong>
                  <span style="font-size:11px;color:#6b7490;">${venueAddress}</span>
                </div>`
              )
            )
            .addTo(map as InstanceType<typeof maptilersdk.Map>);
        });
      } catch {
        // MapTiler failed to load — show fallback
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (map && typeof (map as { remove?: () => void }).remove === "function") {
        (map as { remove: () => void }).remove();
      }
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, lat, lng, venueName, venueAddress]);

  if (!apiKey) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-surface-50 border border-surface-200 gap-3`}>
        <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
          <MapPin className="w-6 h-6 text-brand-400" />
        </div>
        <div className="text-center px-6">
          <p className="text-sm font-semibold text-surface-700">{venueName}</p>
          <p className="text-xs text-surface-400 mt-1">{venueAddress}</p>
          <p className="text-[11px] text-surface-300 mt-3">
            Add <code className="bg-surface-100 px-1 rounded text-[10px]">NEXT_PUBLIC_MAPTILER_KEY</code> to .env.local to enable live maps.
          </p>
          <a
            href="https://cloud.maptiler.com/maps/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-[11px] text-brand-600 hover:underline"
          >
            Get a free MapTiler key →
          </a>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
}
