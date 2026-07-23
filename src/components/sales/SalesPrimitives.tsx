"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Heart,
  Briefcase,
  Disc3,
  Tent,
  Video,
  Drama,
  Cake,
  Sparkles,
  PartyPopper,
  Mic2,
  Music,
  Baby,
  Wifi,
  Share2,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

/** Canonical event-type catalogue shared by the wizard chip grid, tables, cards and kanban. */
export const EVENT_TYPES = [
  "Wedding",
  "Corporate",
  "Nightclub",
  "Festival",
  "Webinar",
  "Theatre",
  "Birthday",
  "Gala",
  "Private Party",
  "Speaker",
  "Concert / Gig",
  "Children's Party",
  "Remote",
  "Hybrid",
  "Other",
] as const;
export type EventTypeName = (typeof EVENT_TYPES)[number];

interface EventTypeMeta {
  icon: LucideIcon;
  chip: string; // chip bg/text classes
  gradient: string; // thumbnail gradient classes
  ring: string; // border/ring accent
}

const EVENT_TYPE_META: Record<string, EventTypeMeta> = {
  Wedding: { icon: Heart, chip: "bg-pink-50 text-pink-700 border-pink-200", gradient: "from-pink-400 via-rose-400 to-amber-200", ring: "ring-pink-200" },
  Corporate: { icon: Briefcase, chip: "bg-blue-50 text-blue-700 border-blue-200", gradient: "from-slate-700 via-blue-800 to-indigo-900", ring: "ring-blue-200" },
  Conference: { icon: Briefcase, chip: "bg-blue-50 text-blue-700 border-blue-200", gradient: "from-slate-700 via-blue-800 to-indigo-900", ring: "ring-blue-200" },
  Nightclub: { icon: Disc3, chip: "bg-violet-50 text-violet-700 border-violet-200", gradient: "from-fuchsia-600 via-purple-700 to-indigo-900", ring: "ring-violet-200" },
  Festival: { icon: Tent, chip: "bg-emerald-50 text-emerald-700 border-emerald-200", gradient: "from-amber-400 via-orange-500 to-rose-600", ring: "ring-emerald-200" },
  Webinar: { icon: Video, chip: "bg-cyan-50 text-cyan-700 border-cyan-200", gradient: "from-cyan-500 via-sky-600 to-blue-700", ring: "ring-cyan-200" },
  Theatre: { icon: Drama, chip: "bg-orange-50 text-orange-700 border-orange-200", gradient: "from-red-800 via-rose-900 to-black", ring: "ring-orange-200" },
  Birthday: { icon: Cake, chip: "bg-yellow-50 text-yellow-700 border-yellow-200", gradient: "from-yellow-400 via-pink-400 to-purple-500", ring: "ring-yellow-200" },
  Gala: { icon: Sparkles, chip: "bg-brand-50 text-brand-700 border-brand-200", gradient: "from-indigo-900 via-violet-800 to-fuchsia-700", ring: "ring-brand-200" },
  "Private Party": { icon: PartyPopper, chip: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", gradient: "from-purple-700 via-fuchsia-700 to-pink-600", ring: "ring-fuchsia-200" },
  Speaker: { icon: Mic2, chip: "bg-teal-50 text-teal-700 border-teal-200", gradient: "from-teal-600 via-emerald-700 to-slate-800", ring: "ring-teal-200" },
  "Concert / Gig": { icon: Music, chip: "bg-red-50 text-red-700 border-red-200", gradient: "from-red-600 via-orange-600 to-yellow-500", ring: "ring-red-200" },
  "Children's Party": { icon: Baby, chip: "bg-sky-50 text-sky-700 border-sky-200", gradient: "from-sky-400 via-teal-400 to-emerald-400", ring: "ring-sky-200" },
  Remote: { icon: Wifi, chip: "bg-slate-50 text-slate-700 border-slate-200", gradient: "from-slate-500 via-slate-700 to-slate-900", ring: "ring-slate-200" },
  Hybrid: { icon: Share2, chip: "bg-indigo-50 text-indigo-700 border-indigo-200", gradient: "from-indigo-500 via-violet-600 to-purple-700", ring: "ring-indigo-200" },
  Charity: { icon: Sparkles, chip: "bg-rose-50 text-rose-700 border-rose-200", gradient: "from-rose-500 via-pink-600 to-fuchsia-700", ring: "ring-rose-200" },
  Exhibition: { icon: Briefcase, chip: "bg-lime-50 text-lime-700 border-lime-200", gradient: "from-lime-600 via-emerald-700 to-teal-800", ring: "ring-lime-200" },
  Other: { icon: MoreHorizontal, chip: "bg-surface-100 text-surface-600 border-surface-200", gradient: "from-surface-400 via-surface-500 to-surface-700", ring: "ring-surface-200" },
};

const FALLBACK_META = EVENT_TYPE_META.Other;

export function eventTypeMeta(type: string | null | undefined): EventTypeMeta {
  if (!type) return FALLBACK_META;
  return EVENT_TYPE_META[type] ?? FALLBACK_META;
}

/** Selectable chip used in the wizard's Event Type grid. */
export function EventTypeChip({
  type,
  selected,
  onClick,
}: {
  type: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm font-medium text-center transition-all",
        selected
          ? "border-brand-500 bg-brand-600 text-white shadow-brand"
          : cn("bg-white hover:bg-surface-50", eventTypeMeta(type).chip)
      )}
    >
      {type}
    </button>
  );
}

/** Thumbnail standing in for licensed event photography: a real seeded photo when
 *  `imageUrl` is set, falling back to a deterministic gradient + icon otherwise. */
export function EventTypeThumb({
  type,
  imageUrl,
  className,
  iconClassName,
  priority,
}: {
  type: string | null | undefined;
  imageUrl?: string | null;
  className?: string;
  iconClassName?: string;
  priority?: boolean;
}) {
  const meta = eventTypeMeta(type);
  const Icon = meta.icon;

  if (imageUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg bg-surface-200", className)}>
        <Image
          src={imageUrl}
          alt={type ?? "Event"}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/10" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br",
        meta.gradient,
        className
      )}
    >
      <Icon className={cn("text-white/70", iconClassName ?? "h-6 w-6")} strokeWidth={1.5} />
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );
}

/** Score ring: SVG progress circle used for lead score + card badges.
 *  `elevated` draws its own white halo/shadow sized exactly to the ring, so
 *  callers never need to hand-wrap it in a mismatched badge circle. */
export function ScoreRing({
  score,
  size = 56,
  strokeWidth = 5,
  label,
  elevated = false,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  elevated?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color =
    clamped >= 80 ? "text-success-500" : clamped >= 60 ? "text-brand-500" : clamped >= 40 ? "text-warning-500" : "text-danger-500";
  const fontSize = Math.max(9, Math.round(size * 0.32));

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        elevated && "rounded-full bg-white shadow-md ring-1 ring-black/5"
      )}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="stroke-surface-100" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          className={cn("transition-all", color)}
          stroke="currentColor"
        />
      </svg>
      <span
        className="relative font-bold leading-none tabular-nums text-surface-900"
        style={{ fontSize }}
      >
        {clamped}
      </span>
      {label && (
        <span className="absolute -bottom-4 text-[10px] font-medium text-surface-400">{label}</span>
      )}
    </div>
  );
}

/** Multi-segment donut for insight rails (source mix, stage distribution). */
export function MiniDonut({
  segments,
  size = 96,
  strokeWidth = 12,
  centerLabel,
  centerSubLabel,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string | number;
  centerSubLabel?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(1, segments.reduce((s, seg) => s + seg.value, 0));

  // Precompute cumulative start offsets (no mutation during render).
  const cumulative: number[] = [];
  segments.reduce((acc, seg) => {
    cumulative.push(acc);
    return acc + seg.value / total;
  }, 0);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="stroke-surface-100" fill="none" />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = circumference * pct;
          const gap = circumference - dash;
          const dashOffset = circumference * (1 - cumulative[i]);
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={dashOffset}
              fill="none"
              stroke={seg.color}
            />
          );
        })}
      </svg>
      {(centerLabel !== undefined || centerSubLabel) && (
        <div className="absolute flex flex-col items-center">
          {centerLabel !== undefined && (
            <span className="text-lg font-bold text-surface-900 tabular-nums leading-none">{centerLabel}</span>
          )}
          {centerSubLabel && <span className="mt-0.5 text-[10px] text-surface-400">{centerSubLabel}</span>}
        </div>
      )}
    </div>
  );
}

/** Deterministic circular initials avatar (no upload required). */
const AVATAR_PALETTE = [
  "bg-brand-100 text-brand-700",
  "bg-info-100 text-info-700",
  "bg-success-100 text-success-700",
  "bg-warning-100 text-warning-700",
  "bg-violet-100 text-violet-700",
  "bg-pink-100 text-pink-700",
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function OwnerAvatar({ name, size = "sm" }: { name: string | null | undefined; size?: "xs" | "sm" | "md" }) {
  const label = (name ?? "?").trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
  const palette = AVATAR_PALETTE[hashString(label) % AVATAR_PALETTE.length];
  const dims = size === "xs" ? "h-5 w-5 text-[9px]" : size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-[11px]";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", palette, dims)}
      title={label}
    >
      {initials}
    </span>
  );
}

/** Priority badge (High / Medium / Low). */
export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  const p = (priority ?? "medium").toLowerCase();
  const map: Record<string, string> = {
    high: "bg-danger-50 text-danger-700 border-danger-200",
    medium: "bg-warning-50 text-warning-700 border-warning-200",
    low: "bg-surface-100 text-surface-600 border-surface-200",
  };
  const label = p.charAt(0).toUpperCase() + p.slice(1);
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", map[p] ?? map.medium)}>
      {label}
    </span>
  );
}

export function formatMoney(cents: number | null | undefined, currency = "GBP"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatMoneyRange(minCents: number | null | undefined, maxCents: number | null | undefined, currency = "GBP"): string {
  if (!minCents && !maxCents) return "—";
  if (minCents && maxCents) return `${formatMoney(minCents, currency)} – ${formatMoney(maxCents, currency)}`;
  return formatMoney(minCents ?? maxCents, currency);
}
