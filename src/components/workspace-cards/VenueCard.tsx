import Link from "next/link";
import { MapPin, Users, ParkingCircle, Utensils, Wifi, Accessibility } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface VenueCardData {
  id: string;
  name: string;
  status: string;
  location: string | null;
  capacity: number | null;
  category: string | null;
  indoor: boolean | null;
  amenities?: Array<"parking" | "catering" | "wifi" | "accessible">;
  coverUrl: string | null;
}

const AMENITY_ICON = { parking: ParkingCircle, catering: Utensils, wifi: Wifi, accessible: Accessibility };

export function VenueCard({ venue, className }: { venue: VenueCardData; className?: string }) {
  return (
    <Link
      href={`/event-manager/venues/${venue.id}`}
      className={cn(
        "group block rounded-xl border border-surface-200 bg-white overflow-hidden hover:border-brand-300 hover:shadow-md transition-all",
        className
      )}
    >
      <div className="relative h-32 bg-gradient-to-br from-surface-700 to-surface-900">
        {venue.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={venue.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute top-2 right-2">
          <StatusBadge status={venue.status as Parameters<typeof StatusBadge>[0]["status"]} />
        </div>
      </div>
      <div className="p-3.5">
        <h3 className="font-semibold text-surface-900 text-sm group-hover:text-brand-700 transition-colors truncate">
          {venue.name}
        </h3>
        {venue.location && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-surface-500 truncate">
            <MapPin className="w-3 h-3 shrink-0" /> {venue.location}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          {venue.capacity != null && (
            <span className="flex items-center gap-1 text-xs text-surface-600">
              <Users className="w-3.5 h-3.5 text-surface-400" /> {venue.capacity.toLocaleString()} capacity
            </span>
          )}
          {venue.category && (
            <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-surface-600">{venue.category}</span>
          )}
        </div>
        {venue.amenities && venue.amenities.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            {venue.amenities.map((a) => {
              const Icon = AMENITY_ICON[a];
              return <Icon key={a} className="w-3.5 h-3.5 text-surface-400" strokeWidth={1.8} />;
            })}
          </div>
        )}
      </div>
    </Link>
  );
}
