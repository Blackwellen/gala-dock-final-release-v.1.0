"use client";

// Shared primitives reused across the six Tasks screens: donut chart, bar
// list, insight card wrapper, priority badge and assignee avatar.

import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/lib/supabase/types";
import { PRIORITY_META, initials } from "./task-utils";

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_META[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0", cfg.classes)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotColor)} />
      {cfg.label}
    </span>
  );
}

export function AssigneeAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  return (
    <div
      title={name}
      className={cn(
        "rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center shrink-0",
        size === "sm" ? "w-7 h-7 text-xs" : "w-6 h-6 text-[10px]"
      )}
    >
      {initials(name)}
    </div>
  );
}

export function InsightCard({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-surface-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const DONUT_COLORS = ["#4f46e5", "#0ea5e9", "#f59e0b", "#22c55e", "#ef4444", "#a855f7"];

export function Donut({
  segments, centerLabel, centerValue,
}: {
  segments: { label: string; value: number; color?: string }[];
  centerLabel: string;
  centerValue: number | string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  const arcs = segments.reduce<{ label: string; color?: string; dash: number; offset: number }[]>((acc, s) => {
    const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    const dash = (s.value / total) * circumference;
    acc.push({ label: s.label, color: s.color, dash, offset: prevOffset });
    return acc;
  }, []);

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="12" />
          {arcs.map((s, i) => (
            <circle
              key={s.label}
              cx="50" cy="50" r={radius} fill="none"
              stroke={s.color ?? DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="12"
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-surface-900 tabular-nums">{centerValue}</span>
          <span className="text-[10px] text-surface-400 text-center leading-tight px-2">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-1.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 min-w-0 text-surface-600 truncate">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color ?? DONUT_COLORS[i % DONUT_COLORS.length] }} />
              {s.label}
            </span>
            <span className="font-semibold text-surface-800 tabular-nums shrink-0">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({
  items, maxItems = 6, colorClass = "bg-brand-500",
}: { items: { label: string; value: number; danger?: boolean }[]; maxItems?: number; colorClass?: string }) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = Math.max(...sorted.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {sorted.map((item) => (
        <li key={item.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-surface-600 truncate">{item.label}</span>
            <span className="font-semibold text-surface-800 tabular-nums shrink-0 ml-2">{item.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div
              className={cn("h-full rounded-full", item.danger ? "bg-danger-500" : colorClass)}
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
      {sorted.length === 0 && <li className="text-xs text-surface-400">No data yet.</li>}
    </ul>
  );
}

export function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);
  const w = 260;
  const h = 60;
  const step = w / Math.max(points.length - 1, 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <path d={path} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
