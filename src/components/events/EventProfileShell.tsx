"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Calendar, MapPin, Users, Star, ChevronDown, UserPlus,
  Check, Lock, Phone, Mail, Building2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface EventTag {
  label: string;
  color: "green" | "blue" | "violet" | "amber" | "gray" | "red" | "indigo";
}

export interface StageStep {
  id: string;
  label: string;
  dateLabel?: string;
  state: "done" | "active" | "upcoming" | "locked";
}

export interface TabItem {
  id: string;
  label: string;
  href: string;
  badge?: number | string;
}

export interface EventProfileShellProps {
  children: React.ReactNode;
  eventId: string;
  name: string;
  tags: EventTag[];
  heroImageUrl?: string | null;
  posterImageUrl?: string | null;
  dateLabel: string;
  venueLabel?: string | null;
  capacityLabel?: string | null;
  ownerName?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  progressPct: number;
  progressLabel?: string;
  stages: StageStep[];
  tabs: TabItem[];
}

/* ─── Tag colour map ─────────────────────────────────────────────────────── */

const TAG_STYLES: Record<EventTag["color"], string> = {
  green:  "bg-green-500/20 text-green-200 border-green-400/30",
  blue:   "bg-blue-500/20  text-blue-200  border-blue-400/30",
  violet: "bg-violet-500/20 text-violet-200 border-violet-400/30",
  amber:  "bg-amber-500/20 text-amber-200 border-amber-400/30",
  gray:   "bg-white/10 text-white/70 border-white/20",
  red:    "bg-red-500/20 text-red-200 border-red-400/30",
  indigo: "bg-indigo-500/20 text-indigo-200 border-indigo-400/30",
};

/* ─── Progress ring ──────────────────────────────────────────────────────── */

function ProgressRing({ pct, label }: { pct: number; label?: string }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center shrink-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/40 mb-2">
        Event Progress
      </p>
      <div className="relative w-[80px] h-[80px]">
        <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90 w-full h-full">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
          <circle
            cx="40" cy="40" r={r} fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#c4b5fd" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[20px] font-extrabold text-white leading-none">{pct}%</span>
        </div>
      </div>
      {label && (
        <div className="flex items-center gap-1 mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-[10px] text-white/50 font-medium">{label}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Stage journey ──────────────────────────────────────────────────────── */

function StageJourney({ stages }: { stages: StageStep[] }) {
  return (
    <div className="bg-white border-b border-surface-100">
      <div className="px-8 py-3.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center min-w-max gap-0">
          {stages.map((stage, i) => {
            const isDone   = stage.state === "done";
            const isActive = stage.state === "active";
            const isLocked = stage.state === "locked";
            const prevDone = i > 0 && stages[i - 1].state === "done";

            return (
              <div key={stage.id} className="flex items-center">
                {/* Connector line */}
                {i > 0 && (
                  <div
                    className={cn(
                      "h-[2px] w-10 shrink-0",
                      prevDone ? "bg-emerald-400" : "bg-surface-200",
                    )}
                  />
                )}

                {/* Stage node */}
                <div className="flex flex-col items-center w-[80px] shrink-0 py-0.5">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
                      isDone   && "bg-emerald-500 border-emerald-500",
                      isActive && "bg-brand-600 border-brand-600 ring-4 ring-brand-100",
                      isLocked && "bg-surface-50 border-surface-200",
                      !isDone && !isActive && !isLocked && "bg-white border-surface-300",
                    )}
                  >
                    {isDone   && <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />}
                    {isActive && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                    {isLocked && <Lock className="w-3 h-3 text-surface-300" strokeWidth={2} />}
                    {!isDone && !isActive && !isLocked && (
                      <div className="w-2 h-2 rounded-full bg-surface-300" />
                    )}
                  </div>

                  <span
                    className={cn(
                      "mt-1.5 text-[10px] font-semibold text-center leading-tight px-1 truncate w-full",
                      isDone   && "text-emerald-600",
                      isActive && "text-brand-700",
                      isLocked && "text-surface-300",
                      !isDone && !isActive && !isLocked && "text-surface-400",
                    )}
                  >
                    {stage.label}
                  </span>

                  {stage.dateLabel && (
                    <span
                      className={cn(
                        "text-[9px] text-center leading-tight px-1 w-full truncate",
                        isDone   && "text-emerald-400",
                        isActive && "text-brand-400 font-medium",
                        !isDone && !isActive && "text-surface-300",
                      )}
                    >
                      {stage.dateLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab nav — single scrollable row ────────────────────────────────────── */

function TabNav({ tabs, eventId }: { tabs: TabItem[]; eventId: string }) {
  const pathname = usePathname();

  function isActive(tab: TabItem) {
    const full = `/event-manager/events/${eventId}/${tab.href}`;
    return pathname === full || pathname.startsWith(full + "/");
  }

  return (
    <div className="bg-white border-b border-surface-200 sticky top-0 z-30">
      <div
        className="flex overflow-x-auto px-6"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.id}
              href={`/event-manager/events/${eventId}/${tab.href}`}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-3 text-[12.5px] font-medium whitespace-nowrap",
                "border-b-2 transition-all duration-150 shrink-0",
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-surface-500 hover:text-surface-800 hover:border-surface-300",
              )}
            >
              {tab.label}
              {tab.badge !== undefined &&
                tab.badge !== null &&
                Number(tab.badge) > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold",
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-surface-100 text-surface-600",
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Event hero ─────────────────────────────────────────────────────────── */

function EventHero({
  eventId,
  name,
  tags,
  heroImageUrl,
  posterImageUrl,
  dateLabel,
  venueLabel,
  capacityLabel,
  ownerName,
  clientName,
  clientEmail,
  clientPhone,
  progressPct,
  progressLabel,
}: Omit<EventProfileShellProps, "children" | "stages" | "tabs">) {
  return (
    /* rounded-t-2xl + overflow-hidden: clips the background image to the card corners */
    <div className="relative overflow-hidden rounded-t-2xl" style={{ minHeight: "220px" }}>
      {/* Background layer */}
      {heroImageUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center scale-[1.02]"
          style={{ backgroundImage: `url(${heroImageUrl})` }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #06041a 0%, #0d0929 30%, #16093e 60%, #1e0b52 80%, #0a0620 100%)",
          }}
        />
      )}

      {/* Gradient overlays for text legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(105deg, rgba(6,4,26,0.98) 0%, rgba(10,7,34,0.93) 28%, rgba(14,10,40,0.78) 55%, rgba(14,10,40,0.50) 75%, rgba(14,10,40,0.28) 100%)",
        }}
      />
      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16"
        style={{
          background:
            "linear-gradient(to top, rgba(6,4,26,0.60) 0%, transparent 100%)",
        }}
      />

      {/* Subtle noise / grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Content row */}
      <div className="relative z-10 flex items-start gap-6 px-8 py-6">

        {/* Poster / cover thumbnail */}
        <div
          className="shrink-0 rounded-xl overflow-hidden border border-white/15 shadow-2xl"
          style={{
            width: 160,
            height: 144,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundImage: posterImageUrl
              ? `url(${posterImageUrl})`
              : "linear-gradient(140deg, #4338ca 0%, #6d28d9 50%, #1e1b4b 100%)",
          }}
        >
          {!posterImageUrl && (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center gap-1">
              <Zap className="w-8 h-8 text-white/30" strokeWidth={1.5} />
              <span className="text-white/50 text-[10px] font-bold tracking-[0.25em] uppercase mt-1">
                No Cover
              </span>
            </div>
          )}
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0 pt-1">
          {/* Title + favourite star */}
          <div className="flex items-start gap-2 mb-2.5">
            <h1 className="text-[26px] font-bold text-white tracking-tight leading-[1.15] line-clamp-2 flex-1 min-w-0">
              {name}
            </h1>
            <button
              aria-label="Favourite this event"
              className="shrink-0 mt-1 p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <Star className="w-5 h-5 text-amber-400/80 fill-amber-400/20 hover:fill-amber-400/60 transition-colors" strokeWidth={1.5} />
            </button>
          </div>

          {/* Tags row */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {tags.map((tag) => (
                <span
                  key={tag.label}
                  className={cn(
                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                    TAG_STYLES[tag.color],
                  )}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}

          {/* Meta rows */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px] text-white/70">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-white/35 shrink-0" strokeWidth={1.8} />
                {dateLabel}
              </span>
              {venueLabel && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-white/35 shrink-0" strokeWidth={1.8} />
                  {venueLabel}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px] text-white/70">
              {capacityLabel && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-white/35 shrink-0" strokeWidth={1.8} />
                  <span className="text-white/40">Capacity:</span>&nbsp;{capacityLabel}
                </span>
              )}
              {ownerName && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-brand-500 text-white text-[9px] font-bold shrink-0">
                    {ownerName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-white/50">Owner:</span>
                  <span className="font-medium text-white/85">{ownerName}</span>
                </span>
              )}
            </div>

            {(clientName || clientEmail || clientPhone) && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-white/55">
                {clientName && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 shrink-0 text-white/30" strokeWidth={1.8} />
                    <span className="text-white/35">Client:</span>
                    <span className="text-white/75 font-medium ml-0.5">{clientName}</span>
                  </span>
                )}
                {clientEmail && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 shrink-0 text-white/30" strokeWidth={1.8} />
                    {clientEmail}
                  </span>
                )}
                {clientPhone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 shrink-0 text-white/30" strokeWidth={1.8} />
                    {clientPhone}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: actions + progress ring */}
        <div className="shrink-0 flex flex-col items-end gap-4 pt-0.5">
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-white/80 text-[12px] font-medium border border-white/12 transition-colors backdrop-blur-sm">
              Event Actions
              <ChevronDown className="w-3 h-3 text-white/60" strokeWidth={2} />
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/14 text-white/80 text-[12px] font-medium border border-white/12 transition-colors backdrop-blur-sm">
              <UserPlus className="w-3.5 h-3.5" strokeWidth={1.8} />
              Invite Team
            </button>
            <Link
              href={`/event-manager/events/${eventId}/edit`}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[12px] font-semibold transition-colors shadow-lg"
            >
              Edit Event
            </Link>
          </div>

          {/* Progress ring */}
          <ProgressRing pct={progressPct} label={progressLabel} />
        </div>
      </div>
    </div>
  );
}

/* ─── Shell ──────────────────────────────────────────────────────────────── */

export function EventProfileShell({
  children,
  eventId,
  name,
  tags,
  heroImageUrl,
  posterImageUrl,
  dateLabel,
  venueLabel,
  capacityLabel,
  ownerName,
  clientName,
  clientEmail,
  clientPhone,
  progressPct,
  progressLabel,
  stages,
  tabs,
}: EventProfileShellProps) {
  return (
    <div className="flex flex-col">
      {/* Hero — rounded-t-2xl clips bg image to card corners */}
      <EventHero
        eventId={eventId}
        name={name}
        tags={tags}
        heroImageUrl={heroImageUrl}
        posterImageUrl={posterImageUrl}
        dateLabel={dateLabel}
        venueLabel={venueLabel}
        capacityLabel={capacityLabel}
        ownerName={ownerName}
        clientName={clientName}
        clientEmail={clientEmail}
        clientPhone={clientPhone}
        progressPct={progressPct}
        progressLabel={progressLabel}
      />

      {/* Stage journey */}
      <StageJourney stages={stages} />

      {/* Tab nav — sticky so it locks to top while scrolling content */}
      <TabNav tabs={tabs} eventId={eventId} />

      {/* Tab content — rounded-b-2xl closes the card shape at the bottom */}
      <div className="bg-surface-50 rounded-b-2xl min-h-[400px]">
        {children}
      </div>
    </div>
  );
}
