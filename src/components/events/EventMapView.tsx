"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, TrendingUp, Calendar, Users } from "lucide-react";
import type { PipelineEvent } from "./EventsPipelineClient";

// Lazy-load MapTiler CSS to avoid SSR issues
let cssLoaded = false;
function ensureCss() {
  if (cssLoaded || typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdn.maptiler.com/maptiler-sdk-js/v2.5.0/maptiler-sdk.css";
  document.head.appendChild(link);
  cssLoaded = true;
}

type Status =
  | "new-enquiry" | "briefing" | "quoting" | "awaiting-approval"
  | "confirmed" | "in-delivery" | "completed" | "cancelled";

const STATUS_COLOR: Record<Status, string> = {
  "new-enquiry":       "#6366f1",
  briefing:            "#7c3aed",
  quoting:             "#0ea5e9",
  "awaiting-approval": "#f59e0b",
  confirmed:           "#16a34a",
  "in-delivery":       "#10b981",
  completed:           "#6b7280",
  cancelled:           "#dc2626",
};

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP", maximumFractionDigits: 0,
});

interface MapEvent extends PipelineEvent {
  lat?: number;
  lng?: number;
}

interface Props {
  events: PipelineEvent[];
}

// London venue coordinates for demo events
const VENUE_COORDS: Record<string, [number, number]> = {
  "ExCeL London":             [ 0.0333, 51.5074],
  "The Shard":                [-0.0866, 51.5045],
  "Wembley Stadium":          [-0.2796, 51.5560],
  "Royal Albert Hall":        [-0.1775, 51.5010],
  "Battersea Power Station":  [-0.1449, 51.4822],
  "Canary Wharf":             [-0.0235, 51.5054],
  "Olympic Park":             [-0.0167, 51.5383],
  "Tobacco Dock":             [-0.0576, 51.5073],
  "The O2 Arena":             [ 0.0032, 51.5025],
  "Alexandra Palace":         [-0.1319, 51.5958],
  "Roundhouse":               [-0.1503, 51.5435],
  "Barbican Centre":          [-0.0933, 51.5202],
  "Somerset House":           [-0.1167, 51.5109],
  "Tate Modern":              [-0.0993, 51.5076],
  "Natural History Museum":   [-0.1760, 51.4967],
  "Science Museum":           [-0.1744, 51.4988],
  "IET London":               [-0.1092, 51.5003],
  "QEII Centre":              [-0.1296, 51.4997],
  "Central Hall Westminster": [-0.1321, 51.4994],
  "Kensington Palace":        [-0.1882, 51.5057],
};

function resolveCoords(event: PipelineEvent): [number, number] | null {
  const venue = event.venue ?? "";
  for (const [key, coords] of Object.entries(VENUE_COORDS)) {
    if (venue.toLowerCase().includes(key.toLowerCase())) return coords;
  }
  // Fallback: scatter around central London
  const hash = event.id.split("").reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
  const lng = -0.12 + (((Math.abs(hash) % 200) - 100) / 500);
  const lat = 51.50 + (((Math.abs(hash >> 4) % 200) - 100) / 1000);
  return [lng, lat];
}

function LocationInsights({ events }: { events: PipelineEvent[] }) {
  const cityMap = new Map<string, { count: number; value: number }>();
  events.forEach(e => {
    const city = (e.venue ?? "Unknown").split(",").pop()?.trim() ?? "London";
    const prev = cityMap.get(city) ?? { count: 0, value: 0 };
    cityMap.set(city, { count: prev.count + 1, value: prev.value + e.budgetCents });
  });
  const cities = [...cityMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);
  const maxCount = Math.max(...cities.map(([, v]) => v.count), 1);

  return (
    <div className="w-72 bg-white border-l border-surface-200 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-4 pt-4 pb-3 border-b border-surface-200">
        <h3 className="text-sm font-semibold text-surface-900">Location Insights</h3>
        <p className="text-xs text-surface-500 mt-0.5">{events.length} events mapped</p>
      </div>

      {/* Stats */}
      <div className="px-4 py-3 space-y-3 border-b border-surface-200">
        {[
          { icon: <Calendar className="w-3.5 h-3.5" />, label: "Total Events", value: events.length },
          { icon: <Users className="w-3.5 h-3.5" />, label: "Total Guests", value: events.reduce((a, e) => a + e.guestCount, 0).toLocaleString("en-GB") },
          { icon: <TrendingUp className="w-3.5 h-3.5" />, label: "Pipeline Value", value: GBP.format(events.reduce((a, e) => a + e.budgetCents, 0) / 100) },
        ].map(s => (
          <div key={s.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-surface-500">
              {s.icon}
              <span className="text-xs">{s.label}</span>
            </div>
            <span className="text-xs font-semibold text-surface-900">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Cities breakdown */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Events by Location</p>
        <div className="space-y-2.5">
          {cities.map(([city, data]) => (
            <div key={city}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-surface-700 truncate max-w-[140px]">{city}</span>
                <span className="text-xs font-semibold text-surface-900">{data.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${(data.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-surface-200 mt-auto">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Status Legend</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.entries(STATUS_COLOR) as [Status, string][]).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[10px] text-surface-600 capitalize truncate">
                {status.replace(/-/g, " ")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EventMapView({ events }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [selected, setSelected] = useState<PipelineEvent | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    ensureCss();

    const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!apiKey || !mapContainer.current) return;

    let destroyed = false;

    import("@maptiler/sdk").then(({ Map: MTMap, config: MTConfig, MapStyle, Marker, Popup }) => {
      if (destroyed || !mapContainer.current) return;

      MTConfig.apiKey = apiKey;

      const map = new MTMap({
        container: mapContainer.current,
        style: MapStyle.STREETS,
        center: [-0.12, 51.505],
        zoom: 10.5,
      });

      mapRef.current = map;

      map.on("load", () => {
        if (destroyed) return;
        setMapReady(true);

        events.forEach(ev => {
          const coords = resolveCoords(ev);
          if (!coords) return;

          const color = STATUS_COLOR[ev.status as Status] ?? "#6366f1";

          // Create custom marker element
          const el = document.createElement("div");
          el.style.cssText = `
            width: 32px; height: 32px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            background: ${color};
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            cursor: pointer;
            transition: transform 0.15s;
          `;
          el.addEventListener("mouseenter", () => {
            el.style.transform = "rotate(-45deg) scale(1.15)";
          });
          el.addEventListener("mouseleave", () => {
            el.style.transform = "rotate(-45deg) scale(1)";
          });
          el.addEventListener("click", () => setSelected(ev));

          new Marker({ element: el })
            .setLngLat(coords)
            .addTo(map);
        });
      });
    }).catch(console.error);

    return () => {
      destroyed = true;
      if (mapRef.current) {
        try { (mapRef.current as { remove(): void }).remove(); } catch {}
        mapRef.current = null;
      }
    };
  }, [events]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-50">
            <div className="text-surface-400 text-sm">Loading map…</div>
          </div>
        )}

        {/* Selected event popup */}
        {selected && (
          <div className="absolute bottom-6 left-6 right-6 md:right-auto md:w-80 bg-white rounded-xl shadow-xl border border-surface-200 p-4 z-10">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-surface-900 text-sm">{selected.name}</p>
                <p className="text-xs text-surface-500 mt-0.5">{selected.client}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-surface-400 hover:text-surface-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-surface-400">Date</span>
                <p className="font-medium text-surface-700">{selected.dateLabel}</p>
              </div>
              <div>
                <span className="text-surface-400">Guests</span>
                <p className="font-medium text-surface-700">{selected.guestCount.toLocaleString("en-GB")}</p>
              </div>
              <div>
                <span className="text-surface-400">Budget</span>
                <p className="font-medium text-surface-700">{GBP.format(selected.budgetCents / 100)}</p>
              </div>
              <div>
                <span className="text-surface-400">Status</span>
                <p className="font-medium text-surface-700 capitalize">{selected.status.replace(/-/g, " ")}</p>
              </div>
            </div>
            {selected.venue && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-surface-500">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {selected.venue}
              </div>
            )}
          </div>
        )}
      </div>
      <LocationInsights events={events} />
    </div>
  );
}
