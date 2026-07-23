"use client";

import { useTransition } from "react";
import { Pin } from "lucide-react";
import { toggleVenueNotePin } from "../../actions";
import { cn } from "@/lib/utils";

export function NotePinButton({
  venueId,
  noteId,
  pinned,
}: {
  venueId: string;
  noteId: string;
  pinned: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={pinned ? "Unpin note" : "Pin note"}
      disabled={isPending}
      onClick={() => startTransition(() => toggleVenueNotePin(venueId, noteId, !pinned))}
      className={cn(
        "p-1 rounded transition-colors",
        pinned ? "text-brand-600 hover:bg-brand-50" : "text-surface-300 hover:text-surface-500 hover:bg-surface-50"
      )}
    >
      <Pin className={cn("w-3.5 h-3.5", pinned && "fill-brand-100")} strokeWidth={1.8} />
    </button>
  );
}
