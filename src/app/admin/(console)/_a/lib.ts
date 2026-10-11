import "server-only";
import type { Db } from "@/lib/workspace/db";

/** Short, stable display references. Seeded/legacy records may carry an explicit `reference`; otherwise derive from the UUID. */
export function shortRef(prefix: string, id: string, explicit?: unknown) {
  return typeof explicit === "string" && explicit ? explicit : `${prefix}-${id.replaceAll("-", "").slice(0, 5).toUpperCase()}`;
}

export type SP = Record<string, string | string[] | undefined>;
export const str = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
export function pageOf(sp: SP, perDefault = 10) {
  const per = [10, 25, 50].includes(Number(str(sp, "per"))) ? Number(str(sp, "per")) : perDefault;
  const page = Math.max(1, Math.floor(Number(str(sp, "page")) || 1));
  return { per, page, offset: (page - 1) * per };
}
/** Builds a query string from the current params, overriding/removing keys (empty string removes). */
export function qs(base: string, sp: SP, patch: Record<string, string | number | null | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) p.set(k, v);
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === "") p.delete(k); else p.set(k, String(v)); }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export const PERIODS: Record<string, { label: string; days: number }> = { "7": { label: "Last 7 days", days: 7 }, "30": { label: "Last 30 days", days: 30 }, "90": { label: "Last 90 days", days: 90 } };
export const periodOf = (sp: SP) => PERIODS[str(sp, "period")] ?? PERIODS["30"]!;

/** Bucket timestamps into a dense daily series ending today (Europe/London days are close enough for sparklines). */
export function dailyCounts<T>(items: T[], at: (t: T) => string | null | undefined, days = 30, value: (t: T) => number = () => 1, now = Date.now()) {
  const end = new Date(now); end.setUTCHours(23, 59, 59, 999);
  const out = Array<number>(days).fill(0);
  for (const it of items) {
    const ts = at(it); if (!ts) continue;
    const idx = days - 1 - Math.floor((end.getTime() - new Date(ts).getTime()) / 864e5);
    if (idx >= 0 && idx < days) out[idx]! += value(it);
  }
  return out;
}
/** Running total of a daily series — trend line for cumulative KPIs. */
export const cumulative = (xs: number[], start = 0) => { let a = start; return xs.map(x => (a += x)); };

/** RPC wrapper for read models: throws so the page shows the error boundary instead of empty operational data. */
export async function rpc<T>(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const planLabel = (p: string) => ({ starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" }[p] ?? p);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** 24-hour London wall-clock time, e.g. "18:00", and a "18:00 – 00:00" range (design format). */
export const hm = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "");
export const hmRange = (a?: string | null, b?: string | null) => (a ? `${hm(a)} – ${hm(b ?? a)}` : "");
export const langName = (code?: string | null) => (code ? ({ en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian", pt: "Portuguese", pl: "Polish" } as Record<string, string>)[code.toLowerCase()] ?? code : "—");
