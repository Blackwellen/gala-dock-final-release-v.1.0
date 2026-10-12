/** Maps a marketplace listing to the build category it fills (listings carry free-text categories). */
const MAP: Record<string, string> = {
  catering: "food", food: "food", "private chef": "food", drinks: "drinks", bar: "drinks", "mobile bar": "drinks",
  dj: "entertainment", "dj & sound": "entertainment", "live music": "entertainment", band: "entertainment", performers: "entertainment",
  photography: "media", videography: "media", "photo booth": "media", "live streaming": "media",
  decor: "styling", flowers: "styling", florist: "styling", styling: "styling", security: "staff", staffing: "staff", "event staff": "staff",
  entertainment: "entertainment", music: "entertainment", "private dining": "food", media: "media", video: "media", hire: "hire",
  production: "production", lighting: "production", "sound & lighting": "production", av: "production",
  marquees: "hire", furniture: "hire", "equipment hire": "hire", transport: "transport", accommodation: "transport",
};
export function buildCategoryOf(kind: string, category: string): string {
  if (kind === "venue") return "venue";
  const c = category.trim().toLowerCase();
  // Nested categories ("Entertainment > DJ") map by their most specific part, then their top level.
  const parts = c.split(/\s*[>/|]\s*/).filter(Boolean);
  return MAP[c] ?? MAP[parts[parts.length - 1] ?? ""] ?? MAP[parts[0] ?? ""] ?? "extras";
}
