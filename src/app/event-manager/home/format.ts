// Client-safe formatting helpers shared by the home dashboard's server data layer
// and its client components (kept separate from data.ts, which pulls in the
// server-only Supabase client).

/** Full-precision currency, e.g. "£167,335" — used for individual record amounts. */
export function exactCurrency(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

/** Compact currency, e.g. "£8.7m" — used for roll-up/aggregate totals. Intl's
 *  "compact" notation renders an uppercase suffix ("£8.7M"); lowercase it to
 *  match the dashboard's convention. */
export function compactCurrency(cents: number, currency: string, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(
    cents / 100
  );
  return formatted.replace(/([KMB])(?!.*[KMB])/, (m) => m.toLowerCase());
}
