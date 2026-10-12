/** Street-map styles served through /api/maps/tile (MapTiler when MAP_TILER_API_KEY is set; OpenStreetMap standard tiles otherwise). */
export const MAP_STYLES = [
  { key: "streets", label: "Streets", maxZoom: 19 },
  { key: "light", label: "Light", maxZoom: 19 },
  { key: "outdoor", label: "Outdoor", maxZoom: 19 },
  { key: "satellite", label: "Satellite", maxZoom: 19 },
  { key: "hybrid", label: "Satellite + labels", maxZoom: 19 },
] as const;
export type MapStyleKey = typeof MAP_STYLES[number]["key"];
export const styleMaxZoom = (style?: string) => MAP_STYLES.find(x => x.key === style)?.maxZoom ?? 19;
export const isMapStyle = (s: string): s is MapStyleKey => MAP_STYLES.some(x => x.key === s);
export const tileUrl = (style: string, z: number, x: number, y: number) => `/api/maps/tile/${isMapStyle(style) ? style : "streets"}/${z}/${x}/${y}`;
export const MAP_ATTRIBUTION = "© MapTiler © OpenStreetMap contributors";
