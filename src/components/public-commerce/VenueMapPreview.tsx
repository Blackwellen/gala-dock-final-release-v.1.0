import { MapPin, DoorOpen, Wine, Accessibility as AccessibilityIcon, Cross, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VenueFacility {
  kind: "entrance" | "bar" | "toilet" | "accessible_toilet" | "first_aid" | "merchandise" | "info";
  label: string;
}

const FACILITY_ICON: Record<VenueFacility["kind"], typeof MapPin> = {
  entrance: DoorOpen,
  bar: Wine,
  toilet: MapPin,
  accessible_toilet: AccessibilityIcon,
  first_aid: Cross,
  merchandise: ShoppingBag,
  info: MapPin,
};

/**
 * Venue/site-map preview. Renders real venue geocoordinates via a static embed when present;
 * otherwise falls back to the organiser-authored facilities list (no fabricated map geometry).
 */
export function VenueMapPreview({
  venueName,
  addressLine1,
  city,
  latitude,
  longitude,
  facilities = [],
  className,
}: {
  venueName: string | null;
  addressLine1?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  facilities?: VenueFacility[];
  className?: string;
}) {
  const hasCoords = latitude != null && longitude != null;

  return (
    <div className={cn("rounded-xl border border-surface-200 bg-white overflow-hidden", className)}>
      <div className="relative h-40 bg-surface-100">
        {hasCoords ? (
          <iframe
            title={`Map of ${venueName ?? "venue"}`}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude! - 0.01}%2C${latitude! - 0.01}%2C${longitude! + 0.01}%2C${latitude! + 0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`}
          />
        ) : (
          <div className="grid h-full place-items-center text-surface-400">
            <div className="text-center">
              <MapPin className="mx-auto h-6 w-6" />
              <p className="mt-1 text-xs">Map unavailable — venue location not set</p>
            </div>
          </div>
        )}
      </div>
      {(venueName || addressLine1) && (
        <div className="p-3 border-t border-surface-100">
          {venueName && <p className="text-sm font-semibold text-surface-900">{venueName}</p>}
          {(addressLine1 || city) && (
            <p className="text-xs text-surface-500">{[addressLine1, city].filter(Boolean).join(", ")}</p>
          )}
        </div>
      )}
      {facilities.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border-t border-surface-100">
          {facilities.map((f, i) => {
            const Icon = FACILITY_ICON[f.kind];
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-surface-50 border border-surface-200 px-2 py-1 text-[11px] text-surface-600"
              >
                <Icon className="w-3 h-3" /> {f.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
