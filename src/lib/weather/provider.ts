import "server-only";

/**
 * Weather provider boundary (domain 162, Q26). Forecast providers (Met Office DataHub, Open-Meteo, Tomorrow.io, OpenWeather …)
 * plug in behind this interface; the `weather.poll` app job is the only caller. React components never call a provider.
 *
 * Status today: no provider is configured → BLOCKED_EXTERNAL. The job then calls `weather_provider_unavailable()`, which marks
 * every active watch `not_configured`, and event readiness shows "Weather monitoring is not connected" next to the contingency
 * plan — never a silent gap. No external weather API is called until an adapter and credentials exist.
 *
 * Env contract (names only, values are never returned):
 *   WEATHER_PROVIDER   met_office | open_meteo | tomorrow_io | openweather   (unset = not configured)
 *   WEATHER_API_KEY    provider credential (not needed for open_meteo)
 */
export const WEATHER_PROVIDERS = ["met_office", "open_meteo", "tomorrow_io", "openweather"] as const;
export type WeatherProviderName = typeof WEATHER_PROVIDERS[number];

/** Hourly forecast in the shape `weather_record_forecast(watch, provider, forecast)` evaluates. */
export type ForecastHour = { at: string; wind_kph?: number; gust_kph?: number; rain_mm_h?: number; temp_c?: number; lightning?: boolean };
export type Forecast = { hours: ForecastHour[] };
export interface WeatherProvider {
  readonly name: WeatherProviderName;
  forecast(input: { latitude: number; longitude: number; from: string; to: string }): Promise<Forecast>;
}

export type WeatherHealth = { status: "configured" | "partial" | "not_configured"; state: "ok" | "BLOCKED_EXTERNAL" | "misconfigured"; provider: WeatherProviderName | null; missing: string[]; issues: string[]; adapter: boolean };

/** Validates the env contract without touching the network. */
export function weatherHealth(env: Record<string, string | undefined> = process.env): WeatherHealth {
  const raw = (env.WEATHER_PROVIDER ?? "").trim().toLowerCase();
  const provider = (WEATHER_PROVIDERS as readonly string[]).includes(raw) ? (raw as WeatherProviderName) : null;
  const issues: string[] = [];
  if (raw && !provider) issues.push(`WEATHER_PROVIDER must be one of ${WEATHER_PROVIDERS.join(", ")}`);
  const needsKey = provider !== "open_meteo";
  const missing = [!raw ? "WEATHER_PROVIDER" : null, needsKey && !env.WEATHER_API_KEY ? "WEATHER_API_KEY" : null].filter((x): x is string => !!x);
  const status = !raw ? "not_configured" : missing.length || issues.length ? "partial" : "configured";
  return { status, state: status === "configured" ? "ok" : status === "not_configured" ? "BLOCKED_EXTERNAL" : "misconfigured", provider, missing, issues, adapter: false };
}

/** Returns the configured adapter, or null. No adapter ships yet (BLOCKED_EXTERNAL until credentials and a sandbox exist). */
export function weatherProvider(env: Record<string, string | undefined> = process.env): WeatherProvider | null {
  if (weatherHealth(env).state !== "ok") return null;
  return null;
}

/** Validates an adapter's output before it reaches the database (drops malformed hours, clamps the list). */
export function normaliseForecast(input: unknown): Forecast {
  const hours = Array.isArray((input as Forecast | null)?.hours) ? (input as Forecast).hours : [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    hours: hours.slice(0, 240).filter(h => h && typeof h.at === "string" && !Number.isNaN(Date.parse(h.at))).map(h => ({
      at: new Date(h.at).toISOString(), wind_kph: num(h.wind_kph), gust_kph: num(h.gust_kph), rain_mm_h: num(h.rain_mm_h), temp_c: num(h.temp_c), lightning: h.lightning === true,
    })),
  };
}
