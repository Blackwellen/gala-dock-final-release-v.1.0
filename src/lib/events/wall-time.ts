// Q48: `<input type="datetime-local">` values carry no timezone ("2026-07-04T19:00"). The app displays event times in
// Europe/London (lib/format), so a naive value is a London wall-clock time. Parsing it with `new Date(v)` on the server reads it
// as UTC instead, which moved every edited time one hour later during BST (and, on an on-sale event, made an untouched date
// look "changed" and blocked the save). Pure module: safe on the client and the server.
import { londonOffset, londonToUtc } from "@/lib/agent/schedule";

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** datetime-local value (London wall time) or any ISO instant → UTC ISO string; null for blank or unparseable input. */
export function wallToIso(v: string | null | undefined): string | null {
  const s = (v ?? "").trim(); if (!s) return null;
  const m = NAIVE.exec(s);
  if (m) return londonToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])).toISOString();
  const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** UTC instant → "YYYY-MM-DDTHH:mm" London wall time for a datetime-local input ("" when blank). */
export function isoToWall(iso: string | null | undefined): string {
  if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + londonOffset(d) * 60000).toISOString().slice(0, 16);
}

/** Same instant to the minute (datetime-local inputs drop seconds). */
export const sameMinute = (a: string | null, b: string | null) => (a && b ? Math.floor(Date.parse(a) / 60000) === Math.floor(Date.parse(b) / 60000) : a === b);
