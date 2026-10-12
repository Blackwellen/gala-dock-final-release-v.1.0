/** Per-device calendar display preferences (cookie, so the server renders the chosen layout). */
export type CalendarPrefs = { weekStart: "mon" | "sun"; weekends: boolean; defaultView: "month" | "week" | "day" | "agenda"; kpis: boolean; compact: boolean };
export const PREFS_COOKIE = "gd_pcal_prefs";
export const DEFAULT_PREFS: CalendarPrefs = { weekStart: "mon", weekends: true, defaultView: "week", kpis: true, compact: false };
export function parsePrefs(raw: string | undefined): CalendarPrefs {
  try {
    const j = JSON.parse(decodeURIComponent(raw ?? "")) as Partial<CalendarPrefs>;
    return {
      weekStart: j.weekStart === "sun" ? "sun" : "mon", weekends: j.weekends !== false,
      defaultView: (["month", "week", "day", "agenda"] as const).includes(j.defaultView as never) ? j.defaultView! : "week",
      kpis: j.kpis !== false, compact: j.compact === true,
    };
  } catch { return DEFAULT_PREFS; }
}
