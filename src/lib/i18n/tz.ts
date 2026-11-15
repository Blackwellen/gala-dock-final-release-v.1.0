// Q72 · Time zones. Every event stores its own IANA zone (events.timezone, default Europe/London for existing UK data); wall-clock
// times typed into forms are read in THAT zone, and dates/times render in it. Pure module (Intl only): client, server and tests.
//
// Rules (docs/release/i18n/gap-register.md §Time):
//  - Instants are stored as UTC timestamptz. A zone is only needed to read or write a wall-clock time.
//  - A wall time that doesn't exist (spring-forward gap) resolves FORWARD by the gap (London 01:30 on change day → 02:30 BST).
//  - A wall time that happens twice (autumn fall-back) resolves to the FIRST occurrence (the daylight-time one).
//  - "Today" for a deadline/date picker is the calendar date in the relevant zone, never the UTC date (00:00–01:00 BST bug).

export const DEFAULT_TZ = "Europe/London";

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) fmtCache.set(tz, f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }));
  return f;
}

/** True when the runtime knows this IANA zone. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim() || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch { return false; }
}
/** The zone if valid, else the default (London) — for reading stored rows that may predate the column. */
export const safeTz = (tz: string | null | undefined, fallback = DEFAULT_TZ) => (isValidTimeZone(tz) ? tz : fallback);

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number; dow: number };

/** Wall-clock fields of instant `d` in `tz`. */
export function wallParts(d: Date, tz: string = DEFAULT_TZ): Wall {
  const p = Object.fromEntries(partsFmt(safeTz(tz)).formatToParts(d).map(x => [x.type, x.value])) as Record<string, string>;
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second), dow: DOW[p.weekday ?? ""] ?? 0 };
}

/** Offset of `tz` from UTC in minutes at instant `d` (London: 0 in GMT, 60 in BST; New York: −300 / −240). */
export function tzOffsetMinutes(d: Date, tz: string = DEFAULT_TZ): number {
  const w = wallParts(d, tz);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant of a wall-clock time in `tz` (gap → forward; overlap → first occurrence). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string = DEFAULT_TZ): Date {
  const zone = safeTz(tz);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const before = tzOffsetMinutes(new Date(guess - 18 * 36e5), zone), after = tzOffsetMinutes(new Date(guess + 18 * 36e5), zone);
  const same = (t: number) => { const w = wallParts(new Date(t), zone); return w.y === y && w.mo === mo && w.d === d && w.h === h && w.mi === mi; };
  const hits = [...new Set([before, after])].map(o => guess - o * 60000).filter(same).sort((a, b) => a - b);
  if (hits.length) return new Date(hits[0]!);
  return new Date(guess - before * 60000); // in the gap: the pre-transition offset lands after the jump
}

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" wall time in `tz` (or any ISO instant) → UTC ISO; null for blank/unparseable. */
export function wallToUtcIso(v: string | null | undefined, tz: string = DEFAULT_TZ): string | null {
  const s = (v ?? "").trim(); if (!s) return null;
  const m = NAIVE.exec(s);
  if (m) return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz).toISOString();
  const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t).toISOString();
}
/** UTC instant → "YYYY-MM-DDTHH:mm" in `tz` for a datetime-local input ("" when blank/invalid). */
export function utcToWallString(iso: string | Date | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!iso) return ""; const d = iso instanceof Date ? iso : new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const w = wallParts(d, tz); return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`;
}

/** Calendar date ("YYYY-MM-DD") in `tz` at `now` — use for date-picker minimums, "today" defaults and overdue checks. */
export function todayIn(tz: string = DEFAULT_TZ, now: number | Date = Date.now()): string {
  const w = wallParts(now instanceof Date ? now : new Date(now), tz); return `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
}
/** Calendar date of an instant in `tz`. */
export const dateIn = (iso: string | Date, tz: string = DEFAULT_TZ) => todayIn(tz, iso instanceof Date ? iso : new Date(iso));
/** "YYYY-MM-DD" + n days (calendar arithmetic, zone-free). */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
/** Start of a calendar day in `tz` as a UTC instant. */
export const startOfDayIn = (ymd: string, tz: string = DEFAULT_TZ) => { const [y, m, d] = ymd.split("-").map(Number); return zonedToUtc(y!, m!, d!, 0, 0, tz); };

/** Short zone name at an instant: "BST", "GMT", "CEST", "EDT" (falls back to "GMT+2"-style when the locale has no abbreviation). */
export function tzAbbrev(iso: string | Date, tz: string = DEFAULT_TZ, locale = "en-GB"): string {
  const d = iso instanceof Date ? iso : new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const zone = safeTz(tz);
  // en-GB knows BST/GMT; en-US knows the North American names; other zones get CET/CEST via the long-name map below.
  const pick = (loc: string) => new Intl.DateTimeFormat(loc, { timeZone: zone, timeZoneName: "short" }).formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "";
  const gb = pick(locale);
  if (gb && !/^GMT[+-−]/.test(gb) && !/^UTC[+-−]/.test(gb)) return gb;
  const us = pick("en-US");
  if (us && !/^GMT[+-−]/.test(us) && !/^UTC[+-−]/.test(us)) return us;
  const long = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" }).formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "";
  const known: Record<string, string> = { "Central European Standard Time": "CET", "Central European Summer Time": "CEST", "Eastern European Standard Time": "EET",
    "Eastern European Summer Time": "EEST", "Western European Standard Time": "WET", "Western European Summer Time": "WEST", "Irish Standard Time": "IST",
    "Japan Standard Time": "JST", "Singapore Standard Time": "SGT", "Hong Kong Standard Time": "HKT", "New Zealand Standard Time": "NZST", "New Zealand Daylight Time": "NZDT",
    "Australian Eastern Standard Time": "AEST", "Australian Eastern Daylight Time": "AEDT", "Australian Western Standard Time": "AWST", "Australian Central Standard Time": "ACST", "Australian Central Daylight Time": "ACDT" };
  return known[long] ?? (gb || us);
}

/** City part of an IANA zone for labels: "America/New_York" → "New York". */
export const tzCity = (tz: string) => (tz.split("/").pop() ?? tz).replace(/_/g, " ");

/** Default zone for a country (ISO-2) — used to seed a new event/workspace; multi-zone countries get their most populous zone. */
export const COUNTRY_DEFAULT_TZ: Readonly<Record<string, string>> = {
  GB: "Europe/London", IE: "Europe/Dublin", US: "America/New_York", CA: "America/Toronto", AU: "Australia/Sydney", NZ: "Pacific/Auckland",
  AT: "Europe/Vienna", BE: "Europe/Brussels", BG: "Europe/Sofia", CH: "Europe/Zurich", CY: "Asia/Nicosia", CZ: "Europe/Prague", DE: "Europe/Berlin",
  DK: "Europe/Copenhagen", EE: "Europe/Tallinn", ES: "Europe/Madrid", FI: "Europe/Helsinki", FR: "Europe/Paris", GR: "Europe/Athens", HK: "Asia/Hong_Kong",
  HU: "Europe/Budapest", IT: "Europe/Rome", JP: "Asia/Tokyo", LT: "Europe/Vilnius", LU: "Europe/Luxembourg", LV: "Europe/Riga", MT: "Europe/Malta",
  NL: "Europe/Amsterdam", NO: "Europe/Oslo", PL: "Europe/Warsaw", PT: "Europe/Lisbon", RO: "Europe/Bucharest", SE: "Europe/Stockholm", SG: "Asia/Singapore",
  SI: "Europe/Ljubljana", SK: "Europe/Bratislava", AE: "Asia/Dubai", ZA: "Africa/Johannesburg",
};
export const defaultTzForCountry = (code: string | null | undefined) => COUNTRY_DEFAULT_TZ[(code ?? "").toUpperCase()] ?? DEFAULT_TZ;

/**
 * Q72 release-date rule (DEC-107 ticket payout window) for any seller country: count Mon–Fri days in the EVENT's zone; skip
 * `holidays` (YYYY-MM-DD). UK sellers pass the England & Wales bank holidays (public.uk_bank_holidays, as
 * dec107_add_business_days does today); sellers elsewhere pass none until a holiday calendar for their country is loaded
 * (docs/release/i18n/gap-register.md I18N-T07). Mirrors the SQL loop: +1 day at a time, the instant keeps its time of day.
 */
export function addBusinessDays(fromIso: string | Date, days: number, opts: { tz?: string; holidays?: readonly string[] } = {}): Date {
  const tz = safeTz(opts.tz); const skip = new Set(opts.holidays ?? []);
  let d = new Date(fromIso instanceof Date ? fromIso.getTime() : Date.parse(fromIso)); let n = 0;
  while (n < Math.max(0, Math.trunc(days))) {
    d = new Date(d.getTime() + 864e5);
    const w = wallParts(d, tz), ymd = `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
    if (w.dow !== 0 && w.dow !== 6 && !skip.has(ymd)) n++;
  }
  return d;
}
