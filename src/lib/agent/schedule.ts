// Routine schedules (Q41/Q43, W13 follow-up). One parser for both stored formats:
//   - organiser / compiled routines: 5-field cron ("0 10 * * *", "0 9 1 * *") or event-relative "event-7d";
//   - provider routines: phrases ("Daily 08:00", "Every 30 min", "Weekly Monday", "48h before events", "Day after event").
// All wall-clock times are Europe/London (BST/GMT handled). Pure module — no I/O — so the worker, the routine UIs,
// the backfill script and unit tests share it. Never triggers a run; it only computes due times.

export const SCHEDULE_TZ = "Europe/London";

export type ScheduleSpec =
  | { kind: "cron"; cron: string; min: Set<number>; hour: Set<number>; dom: Set<number>; mon: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean }
  | { kind: "every"; minutes: number }
  | { kind: "relative"; target: "booking" | "event"; offsetMinutes: number; atLocal?: { h: number; m: number } }
  | { kind: "event-trigger"; event: string };

/** An upcoming booking / event that an event-relative routine runs against. */
export type Occurrence = { id: string; starts_at: string; ends_at?: string | null };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function cronField(s: string, min: number, max: number): Set<number> | null {
  const set = new Set<number>();
  for (const part of s.split(",")) {
    const [range, stepS] = part.split("/"); const step = stepS ? Number(stepS) : 1;
    let a: number, b: number;
    if (range === "*") [a, b] = [min, max];
    else if (range!.includes("-")) [a, b] = range!.split("-").map(Number) as [number, number];
    else { a = Number(range); b = stepS ? max : a; }
    if ([a, b, step].some(n => !Number.isInteger(n)) || a < min || b > max || a > b || step < 1) return null;
    for (let v = a; v <= b; v += step) set.add(max === 7 && v === 7 ? 0 : v);
  }
  return set;
}

function cronSpec(expr: string): ScheduleSpec | null {
  const f = expr.trim().split(/\s+/); if (f.length !== 5) return null;
  const [mi, ho, dom, mo, dow] = [cronField(f[0]!, 0, 59), cronField(f[1]!, 0, 23), cronField(f[2]!, 1, 31), cronField(f[3]!, 1, 12), cronField(f[4]!, 0, 7)];
  if (!mi || !ho || !dom || !mo || !dow) return null;
  return { kind: "cron", cron: f.join(" "), min: mi, hour: ho, dom, mon: mo, dow, domAny: f[2] === "*", dowAny: f[4] === "*" };
}

const hhmm = (s: string | undefined, fallback: { h: number; m: number }) => {
  const m = s?.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i); if (!m) return fallback;
  let h = Number(m[1]); const mm = Number(m[2] ?? 0);
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return h <= 23 && mm <= 59 ? { h, m: mm } : fallback;
};

/** Parses a stored schedule (with the compiled trigger, when present). Returns null when it can't be understood. */
export function parseSchedule(schedule: string | null | undefined, trigger?: { type?: string; cron?: string; event?: string } | null): ScheduleSpec | null {
  if (trigger?.type === "event" && trigger.event) return { kind: "event-trigger", event: trigger.event };
  if (trigger?.cron) return cronSpec(trigger.cron);
  const s = (schedule ?? "").trim(); if (!s) return null;
  if (/^on\s+\S+/.test(s)) return { kind: "event-trigger", event: s.replace(/^on\s+/, "") };
  if (/^(\S+\s+){4}\S+$/.test(s) && /^[\d*,/\-\s]+$/.test(s)) return cronSpec(s);
  const t = s.toLowerCase();
  // event-7d / event-48h / event+1d (organiser form)
  const ev = t.match(/^event\s*([+-])\s*(\d+)\s*(d|h|m)$/);
  if (ev) { const n = Number(ev[2]) * (ev[3] === "d" ? 1440 : ev[3] === "h" ? 60 : 1); return { kind: "relative", target: "event", offsetMinutes: ev[1] === "-" ? -n : n }; }
  const every = t.match(/^every\s+(\d+)\s*(min|mins|minutes?|m|h|hrs?|hours?)\b/);
  if (every) { const n = Number(every[1]) * (/^h/.test(every[2]!) ? 60 : 1); return n >= 5 && n <= 1440 ? { kind: "every", minutes: n } : null; }
  if (/^(every\s+)?hour(ly)?$/.test(t)) return { kind: "every", minutes: 60 };
  const daily = t.match(/^(daily|every day)(?:\s+at)?\s*(.*)$/);
  if (daily) { const { h, m } = hhmm(daily[2], { h: 9, m: 0 }); return cronSpec(`${m} ${h} * * *`); }
  const weekly = t.match(/^(weekly|every)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?(?:\s+at)?\s*(.*)$/);
  if (weekly) { const { h, m } = hhmm(weekly[3], { h: 9, m: 0 }); return cronSpec(`${m} ${h} * * ${DAYS.indexOf(weekly[2]!)}`); }
  const monthly = t.match(/^monthly(?:\s+on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?)?(?:\s+at)?\s*(.*)$/);
  if (monthly) { const day = Number(monthly[1] ?? 1); const { h, m } = hhmm(monthly[2], { h: 9, m: 0 }); return day >= 1 && day <= 28 ? cronSpec(`${m} ${h} ${day} * *`) : null; }
  const before = t.match(/^(\d+)\s*(h|hours?|d|days?)\s+before\s+(?:each\s+)?(events?|bookings?)$/);
  if (before) { const n = Number(before[1]) * (/^d/.test(before[2]!) ? 1440 : 60); return { kind: "relative", target: /^book/.test(before[3]!) ? "booking" : "event", offsetMinutes: -n }; }
  const after = t.match(/^(day|(\d+)\s*days?)\s+after\s+(?:each\s+)?(events?|bookings?)(?:\s+at\s+(.*))?$/);
  if (after) return { kind: "relative", target: /^book/.test(after[3]!) ? "booking" : "event", offsetMinutes: (after[2] ? Number(after[2]) : 1) * 1440, atLocal: hhmm(after[4], { h: 9, m: 0 }) };
  return null;
}

// ── Europe/London wall clock ──────────────────────────────────────────────────────────────────────────────────
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: SCHEDULE_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** London offset from UTC in minutes at the instant `d` (0 in GMT, 60 in BST). */
export function londonOffset(d: Date): number {
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}
/** The UTC instant of a London wall-clock time (a skipped spring-forward minute resolves forward). */
export function londonToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - londonOffset(new Date(guess)) * 60000;
  return new Date(guess - londonOffset(new Date(first)) * 60000);
}
const local = (d: Date) => new Date(d.getTime() + londonOffset(d) * 60000); // read with getUTC* = London fields

function nextCronLondon(s: Extract<ScheduleSpec, { kind: "cron" }>, after: Date): Date | null {
  let t = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  for (let i = 0; i < 200_000; i++) {
    const L = local(new Date(t));
    const dayOk = s.mon.has(L.getUTCMonth() + 1) && (s.domAny && s.dowAny ? true : s.domAny ? s.dow.has(L.getUTCDay()) : s.dowAny ? s.dom.has(L.getUTCDate()) : s.dom.has(L.getUTCDate()) || s.dow.has(L.getUTCDay()));
    if (!dayOk) { t += ((24 - L.getUTCHours()) * 60 - L.getUTCMinutes()) * 60000; continue; } // next London midnight
    if (!s.hour.has(L.getUTCHours())) { t += (60 - L.getUTCMinutes()) * 60000; continue; }
    if (!s.min.has(L.getUTCMinutes())) { t += 60000; continue; }
    return new Date(t);
  }
  return null;
}

function relativeDue(s: Extract<ScheduleSpec, { kind: "relative" }>, o: Occurrence): Date | null {
  const anchor = s.offsetMinutes > 0 ? new Date(o.ends_at || o.starts_at) : new Date(o.starts_at);
  if (Number.isNaN(anchor.getTime())) return null;
  const at = new Date(anchor.getTime() + s.offsetMinutes * 60000);
  if (!s.atLocal) return at;
  const L = local(at); // "day after event" runs at a set London time on that day
  return londonToUtc(L.getUTCFullYear(), L.getUTCMonth() + 1, L.getUTCDate(), s.atLocal.h, s.atLocal.m);
}

export const FAR_FUTURE_ISO = "2999-01-01T00:00:00Z";

/**
 * Next due time strictly after `after`. `lastRun` anchors interval schedules ("every 30 min" → lastRun + 30 min, or now if
 * that is already past). Event-relative schedules pick the earliest due occurrence; with none upcoming they park at FAR_FUTURE.
 */
export function nextRunAt(spec: ScheduleSpec, after: Date, opts: { lastRun?: Date | null; occurrences?: Occurrence[] } = {}): { at: Date; occurrence?: string } | null {
  if (spec.kind === "event-trigger") return { at: new Date(FAR_FUTURE_ISO) };
  if (spec.kind === "cron") { const at = nextCronLondon(spec, after); return at ? { at } : null; }
  if (spec.kind === "every") {
    const base = opts.lastRun && opts.lastRun.getTime() + spec.minutes * 60000 > after.getTime() ? opts.lastRun : after;
    return { at: new Date(base.getTime() + spec.minutes * 60000) };
  }
  let best: { at: Date; occurrence?: string } | null = null;
  for (const o of opts.occurrences ?? []) {
    const at = relativeDue(spec, o);
    if (at && at.getTime() > after.getTime() && (!best || at < best.at)) best = { at, occurrence: o.id };
  }
  return best ?? { at: new Date(FAR_FUTURE_ISO) };
}

/** Plain-English description for the routine UIs. */
export function describeSchedule(spec: ScheduleSpec | null, raw?: string | null): string {
  if (!spec) return raw ?? "Not scheduled";
  if (spec.kind === "every") return spec.minutes % 60 === 0 ? `Every ${spec.minutes / 60 === 1 ? "hour" : `${spec.minutes / 60} hours`}` : `Every ${spec.minutes} minutes`;
  if (spec.kind === "event-trigger") return `When ${spec.event.replace(/[._]/g, " ")} happens`;
  if (spec.kind === "relative") {
    const n = Math.abs(spec.offsetMinutes), unit = n % 1440 === 0 ? `${n / 1440} day${n === 1440 ? "" : "s"}` : n % 60 === 0 ? `${n / 60}h` : `${n} min`;
    return `${unit} ${spec.offsetMinutes < 0 ? "before" : "after"} each ${spec.target}${spec.atLocal ? ` at ${String(spec.atLocal.h).padStart(2, "0")}:${String(spec.atLocal.m).padStart(2, "0")}` : ""}`;
  }
  const [m, h, dom, , dow] = spec.cron.split(" ");
  const time = /^\d+$/.test(h!) && /^\d+$/.test(m!) ? `${h!.padStart(2, "0")}:${m!.padStart(2, "0")}` : null;
  if (time && dom === "*" && dow === "*") return `Daily at ${time}`;
  if (time && dom === "*" && /^\d$/.test(dow!)) return `Weekly on ${DAYS[Number(dow) % 7]![0]!.toUpperCase()}${DAYS[Number(dow) % 7]!.slice(1)} at ${time}`;
  if (time && /^\d+$/.test(dom!) && dow === "*") return `Monthly on day ${dom} at ${time}`;
  return `Cron ${spec.cron} (London time)`;
}
