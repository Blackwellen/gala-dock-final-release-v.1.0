"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Calendar, MapPin, Users, Star, ChevronDown, UserPlus, Edit2,
  Check, Lock, Phone, Mail, Building2,
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
  green:  "bg-green-500/25 text-green-200 border-green-400/40",
  blue:   "bg-blue-500/25  text-blue-200  border-blue-400/40",
  violet: "bg-violet-500/25 text-violet-200 border-violet-400/40",
  amber:  "bg-amber-500/25 text-amber-200 border-amber-400/40",
  gray:   "bg-white/12 text-white/75 border-white/25",
  red:    "bg-red-500/25 text-red-200 border-red-400/40",
  indigo: "bg-indigo-500/25 text-indigo-200 border-indigo-400/40",
};

/* ─── Progress ring ──────────────────────────────────────────────────────── */

function ProgressRing({ pct, label }: { pct: number; label?: string }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-2">
        Event Progress
      </p>
      <div className="relative w-[88px] h-[88px]">
        <svg viewBox="0 0 88 88" className="absolute inset-0 -rotate-90 w-full h-full">
          <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
          <circle
            cx="44" cy="44" r={r} fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a5b4fc" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-bold text-white leading-none">{pct}%</span>
        </div>
      </div>
      {label && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-xs text-white/60 font-medium">{label}</span>
        </div>
      )}
      <div className="mt-2 h-1 w-20 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #6366f1, #a5b4fc)",
          }}
        />
      </div>
    </div>
  );
}

/* ─── Stage journey — circle-based ──────────────────────────────────────── */

function StageJourney({ stages }: { stages: StageStep[] }) {
  const firstNonDoneIdx = stages.findIndex((s) => s.state !== "done");

  return (
    <div className="bg-white border-b border-surface-100">
      <div className="px-6 py-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-start min-w-max">
          {stages.map((stage, i) => {
            const isDone = stage.state === "done";
            const isActive = stage.state === "active";
            const isLocked = stage.state === "locked";
            const lineIsDone = i > 0 && stages[i - 1].state === "done";

            return (
              <div key={stage.id} className="flex items-start">
                {/* Connector line */}
                {i > 0 && (
                  <div className="flex items-center mt-4 shrink-0">
                    <div
                      className={cn(
                        "h-0.5 w-12",
                        lineIsDone ? "bg-success-400" : "bg-surface-200"
                      )}
                    />
                  </div>
                )}

                {/* Stage node */}
                <div className="flex flex-col items-center w-[90px] shrink-0">
                  {/* Circle */}
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                      isDone && "bg-success-500 border-success-500 shadow-sm",
                      isActive &&
                        "bg-brand-600 border-brand-600 shadow-[0_0_0_4px_rgba(79,70,229,0.18)]",
                      !isDone && !isActive && !isLocked &&
                        "bg-white border-surface-300",
                      isLocked && "bg-surface-50 border-surface-200",
                    )}
                  >
                    {isDone && (
                      <Check className="w-4 h-4 text-white" strokeWidth={2.5} />
                    )}
                    {isActive && (
                      <div className="w-3 h-3 rounded-full bg-white" />
                    )}
                    {isLocked && (
                      <Lock className="w-3.5 h-3.5 text-surface-300" strokeWidth={2} />
                    )}
                    {!isDone && !isActive && !isLocked && (
                      <div className="w-2.5 h-2.5 rounded-full bg-surface-300" />
                    )}
                  </div>

                  {/* Stage label */}
                  <span
                    className={cn(
                      "mt-2 text-[11px] font-semibold text-center leading-tight px-1",
                      isDone && "text-success-700",
                      isActive && "text-brand-700",
                      !isDone && !isActive && "text-surface-400",
                    )}
                  >
                    {stage.label}
                  </span>

                  {/* Date label */}
                  {stage.dateLabel && (
                    <span
                      className={cn(
                        "mt-0.5 text-[10px] text-center leading-tight px-1",
                        isDone && "text-success-500",
                        isActive && "text-brand-500 font-medium",
                        !isDone && !isActive && "text-surface-400",
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
        className="flex overflow-x-auto px-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.id}
              href={`/event-manager/events/${eventId}/${tab.href}`}
              className={cn(
                "flex items-center gap-1.5 px-3 py-3.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-all shrink-0",
                active
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300",
              )}
            >
              {tab.label}
              {tab.badge !== undefined &&
                tab.badge !== null &&
                Number(tab.badge) > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold",
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-success-100 text-success-700",
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
    <div className="relative overflow-hidden" style={{ minHeight: "210px" }}>
      {/* Background layer */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: heroImageUrl
            ? `url(${heroImageUrl})`
            : undefined,
          background: heroImageUrl
            ? undefined
            : "linear-gradient(135deg, #0a0820 0%, #1a0a4e 35%, #2d1266 65%, #14083a 100%)",
        }}
      />
      {/* Gradient overlay — ensures left readability, right shows image */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(8,6,24,0.97) 0%, rgba(12,9,32,0.92) 30%, rgba(14,12,39,0.72) 60%, rgba(14,12,39,0.45) 80%, rgba(14,12,39,0.25) 100%)",
        }}
      />

      {/* Content row */}
      <div className="relative z-10 flex items-start gap-5 px-6 py-5">

        {/* Poster */}
        <div
          className="shrink-0 rounded-xl overflow-hidden border border-white/20 shadow-2xl"
          style={{
            width: 168,
            height: 152,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundImage: posterImageUrl
              ? `url(${posterImageUrl})`
              : "linear-gradient(140deg, #4f46e5 0%, #7c3aed 55%, #1e1b4b 100%)",
          }}
        >
          {!posterImageUrl && (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
              {name.split(" ").slice(0, 3).map((word, i) => (
                <span
                  key={i}
                  className="block text-white font-black tracking-widest uppercase leading-tight text-sm"
                >
                  {word}
                </span>
              ))}
              <span className="mt-2 text-white/40 text-[9px] font-bold tracking-[0.35em] uppercase">
                2026
              </span>
            </div>
          )}
        </div>

        {/* Info block */}
        <div className="flex-1 min-w-0 pt-0.5">
          {/* Title + star */}
          <div className="flex items-center gap-2.5 mb-2.5">
            <h1 className="text-[27px] font-bold text-white tracking-tight leading-tight truncate">
              {name}
            </h1>
            <button className="shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors">
              <Star className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
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

          {/* Meta */}
          <div className="space-y-1.5">
            {/* Row 1: date + venue */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-white/75">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-white/45 shrink-0" strokeWidth={1.8} />
                {dateLabel}
              </span>
              {venueLabel && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-white/45 shrink-0" strokeWidth={1.8} />
                  {venueLabel}
                </span>
              )}
            </div>

            {/* Row 2: capacity + owner */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-white/75">
              {capacityLabel && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-white/45 shrink-0" strokeWidth={1.8} />
                  Capacity: {capacityLabel}
                </span>
              )}
              {ownerName && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold shrink-0">
                    {ownerName.charAt(0).toUpperCase()}
                  </span>
                  Owner:{" "}
                  <span className="font-semibold text-white/90 ml-1">
                    {ownerName}
                  </span>
                </span>
              )}
            </div>

            {/* Row 3: client + email + phone */}
            {(clientName || clientEmail || clientPhone) && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-white/60">
                {clientName && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0 text-white/35" strokeWidth={1.8} />
                    Client:{" "}
                    <span className="ml-1 text-white/80 font-medium">{clientName}</span>
                  </span>
                )}
                {clientEmail && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 shrink-0 text-white/35" strokeWidth={1.8} />
                    {clientEmail}
                  </span>
                )}
                {clientPhone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 shrink-0 text-white/35" strokeWidth={1.8} />
                    {clientPhone}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions + Progress */}
        <div className="shrink-0 flex flex-col items-end gap-4 pt-0.5">
          {/* Buttons */}
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/18 text-white/90 text-[13px] font-medium border border-white/15 transition-colors">
              Event Actions
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/18 text-white/90 text-[13px] font-medium border border-white/15 transition-colors">
              <UserPlus className="w-3.5 h-3.5" strokeWidth={1.8} />
              Invite Team
            </button>
            <Link
              href={`/event-manager/events/${eventId}/edit`}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[13px] font-semibold shadow-brand transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
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
    <div className="flex flex-col min-h-full">
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
      <StageJourney stages={stages} />
      <TabNav tabs={tabs} eventId={eventId} />
      <div className="flex-1 min-h-0 bg-surface-50">
        {children}
      </div>
    </div>
  );
}
