// Q70 wizard tracer: shared, pure helpers for multi-step flows (safe on the client and the server).

/**
 * `?step=` → a whole step number in 1…max. Fractional ("2.5"), negative, blank, "Infinity" and junk values fall back to
 * `fallback`; the result never exceeds `max`. Pages used `Number(sp.step) || 1`, so "?step=2.5" rendered no step at all.
 */
export function parseStep(raw: string | string[] | null | undefined, max: number, fallback = 1): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  const top = Math.max(1, Math.trunc(max));
  const base = Math.min(top, Math.max(1, Math.trunc(fallback) || 1));
  return Number.isInteger(n) && n >= 1 ? Math.min(top, n) : base;
}

/**
 * Text typed into a money/decimal field → the text to keep showing. Keeps digits and the first decimal point, limited to
 * `decimals` places, so "12." and "12.5" survive while the user types (a controlled `value={n}` dropped the point, and
 * `value={n.toFixed(2)}` jumped the caret, so prices like £12.50 or even £25 could not be typed).
 */
export function cleanDecimalText(raw: string, decimals = 2): string {
  const s = String(raw ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot < 0) return s;
  const whole = s.slice(0, dot), frac = s.slice(dot + 1).replace(/\./g, "");
  return decimals <= 0 ? whole : `${whole}.${frac.slice(0, decimals)}`;
}

/** Number held by a decimal field's text ("" and "." are 0). */
export const decimalValue = (text: string) => { const n = Number(text); return Number.isFinite(n) ? n : 0; };

