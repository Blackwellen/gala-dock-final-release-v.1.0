"use client";

import { useState, useTransition } from "react";
import { Heart, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleFavourite, toggleCompareItem } from "@/lib/marketplace/actions";

// Phase 4: wired to marketplace_favourites / marketplace_comparison_items via server actions.
// Optimistic UI: flip immediately, roll back if the action throws or returns a soft failure
// (compare limit reached). `useTransition` matches the pattern already used elsewhere in this
// codebase for client components calling server actions directly (see EvidenceList.tsx).

export function FavouriteButton({
  listingId,
  defaultActive = false,
  variant = "icon",
  className,
}: {
  listingId: string;
  defaultActive?: boolean;
  variant?: "icon" | "icon-dark";
  className?: string;
}) {
  const [active, setActive] = useState(defaultActive);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !active;
    setActive(next);
    startTransition(async () => {
      try {
        const result = await toggleFavourite(listingId);
        setActive(result.favourited);
      } catch {
        setActive(!next); // roll back to prior state
      }
    });
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove from favourites" : "Add to favourites"}
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors shrink-0 disabled:opacity-70",
        variant === "icon-dark" ? "bg-white/90 hover:bg-white shadow-sm backdrop-blur-sm" : "bg-white border border-surface-200 hover:border-surface-300",
        className
      )}
    >
      <Heart className={cn("w-4 h-4", active ? "fill-danger-500 text-danger-500" : "text-surface-500")} />
    </button>
  );
}

export function CompareToggleButton({
  listingId,
  defaultActive = false,
  className,
}: {
  listingId: string;
  defaultActive?: boolean;
  className?: string;
}) {
  const [active, setActive] = useState(defaultActive);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setLimitMessage(null);
    const next = !active;
    setActive(next);
    startTransition(async () => {
      try {
        const result = await toggleCompareItem(listingId);
        setActive(result.compared);
        if (result.reason === "limit_reached") {
          setLimitMessage("Compare up to 4 at a time");
          window.setTimeout(() => setLimitMessage(null), 3000);
        }
      } catch {
        setActive(!next); // roll back to prior state
      }
    });
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-pressed={active}
        aria-label={active ? "Remove from comparison" : "Add to comparison"}
        onClick={handleClick}
        disabled={isPending}
        className={cn(
          "inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-sm backdrop-blur-sm transition-colors shrink-0 disabled:opacity-70",
          active && "ring-2 ring-brand-500",
          className
        )}
      >
        <Scale className={cn("w-4 h-4", active ? "text-brand-600" : "text-surface-500")} />
      </button>
      {limitMessage && (
        <span
          role="status"
          aria-live="polite"
          className="absolute top-full right-0 mt-1.5 whitespace-nowrap rounded-md bg-surface-900 px-2 py-1 text-[11px] font-medium text-white shadow-md z-10"
        >
          {limitMessage}
        </span>
      )}
    </span>
  );
}
