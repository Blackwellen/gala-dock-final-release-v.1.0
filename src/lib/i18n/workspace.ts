// Q72 · A workspace's locale defaults (country, currency, timezone, distance unit) from its stored settings. Pure module.
// Settings keep the master-data country NAME (organisation.country / business.country / country — see connect-countries.ts),
// settings.currency and settings.timezone (validated by update_workspace_settings). Unknown values fall back to the UK defaults
// that every pre-Q72 row was created with.
import { COUNTRIES } from "@/lib/master-data";
import { resolveCountryCode, workspaceCountryValue } from "@/lib/payments/connect-countries";
import { countryProfile, distanceUnit } from "./countries";
import { isCheckoutCurrency, sellerCurrency } from "./money";
import { DEFAULT_TZ, defaultTzForCountry, isValidTimeZone } from "./tz";

export type WorkspaceLocale = { country: string | null; currency: string; timezone: string; distance: "mi" | "km" };

export function workspaceLocale(settings: unknown, opts: { connectDefaultCurrency?: string | null } = {}): WorkspaceLocale {
  const s = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>;
  const country = resolveCountryCode(workspaceCountryValue(s), COUNTRIES);
  const tz = typeof s.timezone === "string" && isValidTimeZone(s.timezone) ? s.timezone : country ? defaultTzForCountry(country) : DEFAULT_TZ;
  const currency = sellerCurrency({ connectDefault: opts.connectDefaultCurrency, workspaceCurrency: isCheckoutCurrency(s.currency) ? String(s.currency) : null, countryCurrency: countryProfile(country)?.currency ?? null });
  return { country, currency, timezone: tz, distance: distanceUnit(country ?? "GB") };
}
