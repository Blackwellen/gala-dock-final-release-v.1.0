// Q72 · Money. One formatter for every surface (Intl by currency + locale), currency-aware minor units, the checkout currency gate,
// the seller-currency rule and per-currency totals for reporting. Pure module (Intl only): client, server and tests.
//
// Rules (docs/release/i18n/gap-register.md §Currency):
//  - Amounts in the database are major units in numeric columns (12.50) or *_minor bigint. Never add across currencies.
//  - A price shown to a buyer names its currency unambiguously: en-GB renders USD as "US$", CAD as "CA$", EUR as "€".
//  - A seller prices in the currency of their Stripe Connect account (default_currency) unless they choose another
//    transactional currency; checkout charges in the event/listing currency (direct charge; Stripe converts on settlement).
//  - Checkout only takes CHECKOUT_CURRENCIES: two-decimal currencies whose Stripe minor unit is 1/100. Zero-decimal (JPY) and
//    Stripe "special case" currencies (HUF, ISK, TWD, UGX) need per-currency minor-unit handling in the SQL quote first.

export const UI_LOCALE = "en-GB";

/** Two-decimal currencies Gala Dock can charge, invoice and pay out in today (all Connect-country defaults except JPY/HUF). */
export const CHECKOUT_CURRENCIES = ["GBP", "EUR", "USD", "AUD", "CAD", "CHF", "CZK", "DKK", "HKD", "NOK", "NZD", "PLN", "RON", "SEK", "SGD"] as const;
export type CheckoutCurrency = (typeof CHECKOUT_CURRENCIES)[number];
/** Stripe zero-decimal currencies (amount is in major units). https://docs.stripe.com/currencies#zero-decimal */
export const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
/** Stripe special cases: two-decimal in the API but payouts/charges must be whole units (or other quirks). */
export const STRIPE_SPECIAL = new Set(["HUF", "ISK", "TWD", "UGX"]);

const norm = (c: unknown) => (typeof c === "string" ? c.trim().toUpperCase() : "");
export const isCheckoutCurrency = (c: unknown): c is CheckoutCurrency => (CHECKOUT_CURRENCIES as readonly string[]).includes(norm(c));

/** Digits after the decimal point for display and for Stripe amounts. */
export function minorDigits(currency: string): number {
  const c = norm(currency);
  if (ZERO_DECIMAL.has(c)) return 0;
  try { return new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; }
}
/** Major units (numeric DB columns) → Stripe minor units without float drift. JPY 1200 → 1200; GBP 12.5 → 1250. */
export function toMinorUnits(amount: number | string, currency: string): number {
  const d = minorDigits(currency); return Math.round(Number(amount) * 10 ** d);
}
export function fromMinorUnits(minor: number | string, currency: string): number {
  const d = minorDigits(currency); return Number(minor) / 10 ** d;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, o: Intl.NumberFormatOptions) {
  const k = `${locale}|${JSON.stringify(o)}`; let f = nfCache.get(k);
  if (!f) nfCache.set(k, f = new Intl.NumberFormat(locale, o));
  return f;
}
export type MoneyOpts = { locale?: string; decimals?: boolean; compact?: boolean; /** "code" always shows the ISO code ("EUR 12.50"). */ display?: "symbol" | "code" | "narrowSymbol" };

/** Formats an amount in `currency` for `locale` (UI default en-GB). Unknown currency codes fall back to "CODE 12.50". */
export function formatMoney(value: number | string | null | undefined, currency: string | null | undefined = "GBP", opts: MoneyOpts = {}): string {
  const n = Number(value ?? 0), c = norm(currency) || "GBP", locale = opts.locale ?? UI_LOCALE;
  const digits = opts.decimals ? minorDigits(c) : 0;
  try {
    if (opts.compact && Math.abs(n) >= 1000) return nf(locale, { style: "currency", currency: c, currencyDisplay: opts.display ?? "symbol", notation: "compact", maximumFractionDigits: 1 }).format(n);
    return nf(locale, { style: "currency", currency: c, currencyDisplay: opts.display ?? "symbol", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  } catch {
    return `${c} ${nf(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)}`;
  }
}
/** Formats with a trailing ISO code when the symbol alone could be read as another currency ("$" / "kr" / "Fr"): "€25.00 EUR". */
export function formatMoneyExplicit(value: number | string | null | undefined, currency: string | null | undefined = "GBP", opts: Omit<MoneyOpts, "display"> = {}): string {
  const c = norm(currency) || "GBP"; const s = formatMoney(value, c, { ...opts, decimals: opts.decimals ?? true });
  return c === "GBP" && (opts.locale ?? UI_LOCALE) === "en-GB" ? s : s.includes(c) ? s : `${s} ${c}`;
}
/** Symbol for an input adornment ("£", "€", "US$", "CHF"). */
export function currencySymbol(currency: string | null | undefined, locale = UI_LOCALE): string {
  const c = norm(currency) || "GBP";
  try { return nf(locale, { style: "currency", currency: c, maximumFractionDigits: 0 }).formatToParts(0).find(p => p.type === "currency")?.value ?? c; } catch { return c; }
}

/** Seller currency: the Connect account's default currency when it is transactional, then the workspace setting, then the country's. */
export function sellerCurrency(p: { connectDefault?: string | null; workspaceCurrency?: string | null; countryCurrency?: string | null }): string {
  for (const c of [p.connectDefault, p.workspaceCurrency, p.countryCurrency]) if (isCheckoutCurrency(c)) return norm(c);
  return "GBP";
}

export type CurrencyTotal = { currency: string; total: number; count: number };
/** Sums rows per currency (never across currencies). Rows without a currency count as `fallback` (GBP for pre-Q72 rows). Largest first. */
export function totalsByCurrency<T>(rows: readonly T[], amount: (r: T) => number | string | null | undefined, currency: (r: T) => string | null | undefined, fallback = "GBP"): CurrencyTotal[] {
  const m = new Map<string, CurrencyTotal>();
  for (const r of rows) {
    const c = norm(currency(r)) || fallback, n = Number(amount(r) ?? 0);
    if (!Number.isFinite(n)) continue;
    const t = m.get(c) ?? { currency: c, total: 0, count: 0 };
    t.total = Math.round((t.total + n) * 100) / 100; t.count += 1; m.set(c, t);
  }
  return [...m.values()].sort((a, b) => (a.currency === fallback ? -1 : b.currency === fallback ? 1 : b.total - a.total));
}
/** "£1,200 · €340 · US$90" — one figure per currency for KPI tiles. */
export const formatTotals = (totals: readonly CurrencyTotal[], opts: MoneyOpts = {}) =>
  totals.length ? totals.map(t => formatMoney(t.total, t.currency, opts)).join(" · ") : formatMoney(0, "GBP", opts);

// ── Q76 · Per-currency fee catalogue (owner decision O3) ─────────────────────────────────────────────────────────────
// Mirror of public.ref_fee_catalogue (migration 202611147651): local price points for the GBP basis (ticket booking fee £1.00,
// booking admin-fee minimum £1.00), and a reference rate + rounding step used when the GBP setting is changed before the row is
// re-reviewed. The database (fee_fixed_minor_in) decides what is charged; this copy is for display before payment and is checked
// against the migration seed in tests/release/q76-i18n-phase2.spec.ts. Reference rates, never FX for charging.
export type FeeKind = "ticket_fixed" | "booking_admin_min";
export const FEE_CATALOGUE: Readonly<Record<string, { rate: number; step: number; basis: number; ticket_fixed: number; booking_admin_min: number }>> = {
  GBP: { rate: 1, step: 1, basis: 100, ticket_fixed: 100, booking_admin_min: 100 },
  EUR: { rate: 1.15, step: 10, basis: 100, ticket_fixed: 120, booking_admin_min: 120 },
  USD: { rate: 1.3, step: 10, basis: 100, ticket_fixed: 130, booking_admin_min: 130 },
  CAD: { rate: 1.8, step: 10, basis: 100, ticket_fixed: 180, booking_admin_min: 180 },
  AUD: { rate: 2, step: 10, basis: 100, ticket_fixed: 200, booking_admin_min: 200 },
  NZD: { rate: 2.25, step: 10, basis: 100, ticket_fixed: 220, booking_admin_min: 220 },
  CHF: { rate: 1.08, step: 10, basis: 100, ticket_fixed: 110, booking_admin_min: 110 },
  SGD: { rate: 1.72, step: 10, basis: 100, ticket_fixed: 170, booking_admin_min: 170 },
  HKD: { rate: 10.1, step: 50, basis: 100, ticket_fixed: 1000, booking_admin_min: 1000 },
  CZK: { rate: 28.5, step: 100, basis: 100, ticket_fixed: 2900, booking_admin_min: 2900 },
  DKK: { rate: 8.6, step: 50, basis: 100, ticket_fixed: 850, booking_admin_min: 850 },
  NOK: { rate: 14.6, step: 100, basis: 100, ticket_fixed: 1500, booking_admin_min: 1500 },
  SEK: { rate: 14.3, step: 100, basis: 100, ticket_fixed: 1500, booking_admin_min: 1500 },
  PLN: { rate: 4.95, step: 50, basis: 100, ticket_fixed: 500, booking_admin_min: 500 },
  RON: { rate: 5.8, step: 50, basis: 100, ticket_fixed: 600, booking_admin_min: 600 },
};
/** A fixed fee set in GBP minor units, in `currency` minor units (same rule as SQL fee_fixed_minor_in). GBP is returned unchanged. */
export function localFixedFeeMinor(kind: FeeKind, gbpMinor: number, currency: string | null | undefined): number {
  const c = norm(currency) || "GBP"; const g = Math.round(Number(gbpMinor) || 0);
  if (g <= 0 || c === "GBP") return g;
  const row = FEE_CATALOGUE[c]; if (!row) return g;
  if (row.basis === g) return row[kind];
  return Math.max(row.step, Math.round((g * row.rate) / row.step) * row.step);
}
