// Display formatting shared by Customer and Organizer surfaces. All dates render in the event/workspace timezone.
import { resolveTerm, term } from "@/lib/master-data";
import { formatMoney } from "@/lib/i18n/money";
import { DEFAULT_TZ, safeTz, tzAbbrev } from "@/lib/i18n/tz";
// Q72: London is only the DEFAULT. Pass the event's own zone (events.timezone) wherever an event time is shown.
const TZ = DEFAULT_TZ;

/** Q72: Intl by currency (src/lib/i18n/money.ts). JPY etc. get their own decimals; unknown codes render as "CODE 12". */
export function money(value: number | string | null | undefined, currency: string | null = "GBP", opts: { decimals?: boolean; compact?: boolean } = {}) {
  return formatMoney(value, currency || "GBP", { decimals: opts.decimals, compact: opts.compact });
}
export const num = (n: number | null | undefined) => new Intl.NumberFormat("en-GB").format(Number(n ?? 0));
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function parts(iso: string, tz = TZ) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: safeTz(tz), weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value])) as Record<string, string>;
}
/** "Sat, 14 Jun 2027" */
export const dateLong = (iso?: string | null, tz = TZ) => { if (!iso) return "Date to be confirmed"; const p = parts(iso, tz); return `${p.weekday}, ${p.day} ${p.month} ${p.year}`; };
/** "14 Jun 2027" */
export const dateShort = (iso?: string | null, tz = TZ) => { if (!iso) return "—"; const p = parts(iso, tz); return `${Number(p.day)} ${p.month} ${p.year}`; };
/** "14 Jun" */
export const dayMonth = (iso?: string | null, tz = TZ) => { if (!iso) return "—"; const p = parts(iso, tz); return `${Number(p.day)} ${p.month}`; };
/** "18:00" */
export const time = (iso?: string | null, tz = TZ) => { if (!iso) return ""; const p = parts(iso, tz); return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`; };
/** "4:00 PM" */
export const time12 = (iso?: string | null, tz = TZ) => iso ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "";
export const timeRange = (a?: string | null, b?: string | null, tz = TZ) => (a ? `${time(a, tz)}${b ? ` – ${time(b, tz)}` : ""}` : "Time to be confirmed");
/** Q72: "BST", "CEST", "EDT" — the event zone's abbreviation at that instant. */
export const zoneAbbr = (iso?: string | null, tz = TZ) => (iso ? tzAbbrev(iso, safeTz(tz)) : "");
/** Q72: "Sat, 14 Jun 2027 · 19:00 – 23:00 CEST" — an event time with its zone named. */
export const whenInZone = (a?: string | null, b?: string | null, tz = TZ) => (a ? `${dateLong(a, tz)} · ${timeRange(a, b, tz)} ${zoneAbbr(a, tz)}`.trim() : "Date to be confirmed");
export const timeRange12 = (a?: string | null, b?: string | null, tz = TZ) => (a ? `${time12(a, tz)}${b ? ` – ${time12(b, tz)}` : ""}` : "Time to be confirmed");
/** { mon: "APR", day: "26" } date badge */
export const dateBadge = (iso?: string | null, tz = TZ) => { if (!iso) return { mon: "TBC", day: "–" }; const p = parts(iso, tz); return { mon: p.month.toUpperCase(), day: String(Number(p.day)) }; };

export function relative(iso?: string | null, now = Date.now()) {
  if (!iso) return "";
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return dateShort(iso);
}
/** Countdown parts until a server-provided timestamp. */
export function countdown(iso?: string | null, now = Date.now()) {
  const ms = Math.max(0, (iso ? new Date(iso).getTime() : now) - now);
  return { days: Math.floor(ms / 864e5), hours: Math.floor(ms / 36e5) % 24, mins: Math.floor(ms / 6e4) % 60, secs: Math.floor(ms / 1e3) % 60, done: ms === 0 };
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join("");
export const titleCase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export const EVENT_TYPE_LABEL: Record<string, string> = {
  festival: "Festival", corporate: "Corporate", food_drink: "Food & Drink", nightlife: "Nightlife", wedding: "Wedding", conference: "Conference",
  community: "Community", awards: "Awards", party: "Party", comedy: "Comedy", birthday: "Birthday", private_dinner: "Private Dinner",
  childrens_party: "Children's Party", webinar: "Webinar", custom: "Custom",
  virtual_event: "Virtual Event", live_audio: "Live Audio", podcast_recording: "Podcast Live Recording", hybrid: "Hybrid Event", remote_conference: "Remote Conference",
};
// Keys without a short label here fall back to the canonical master-data label ("religious" → "Faith & Cultural"), then title case.
export const eventTypeLabel = (t?: string | null) => EVENT_TYPE_LABEL[t ?? ""] ?? term("event_type", resolveTerm("event_type", t) ?? "")?.label ?? titleCase(t ?? "Event");
