import { cn } from "@/lib/utils";
import { BOOKING_STATUS_META, coerceBookingStatus } from "./lib";

/** Status pill for venue booking lifecycle (enquiry/held/confirmed/completed/cancelled). */
export function BookingStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = BOOKING_STATUS_META[coerceBookingStatus(status)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        meta.classes,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
      {meta.label}
    </span>
  );
}
