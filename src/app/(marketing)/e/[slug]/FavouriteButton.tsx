"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleFavourite } from "@/app/(marketing)/discover/actions";

/** Hero-sized favourite toggle. Mirrors the card-level toggle in PublicEventCard.tsx but styled
 *  for the profile page's dark hero band. Reverts optimistically on failure (e.g. not signed in). */
export function FavouriteButton({ slug, initial }: { slug: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from favourites" : "Add to favourites"}
      onClick={() => {
        setOn((v) => !v);
        start(async () => {
          const res = await toggleFavourite(slug);
          if (!res.ok) setOn((v) => !v);
        });
      }}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-colors",
        on
          ? "border-white/30 bg-white text-danger-600"
          : "border-white/30 bg-white/10 text-white hover:bg-white/20"
      )}
    >
      <Heart className={cn("h-4 w-4", on && "fill-current")} strokeWidth={2} />
      Favourite
    </button>
  );
}
