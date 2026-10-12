// Design asset libraries shared by Media Studio and the venue/event map studio. Data lives in public/design-assets/
// (built by scripts/build-design-assets.mjs) and is fetched only when a picker opens, then cached for the session.
export type FontMeta = { f: string; c: string; w: number[]; i: boolean; p: number };
export type EmojiMeta = { e: string; n: string; g: string; t: string[] };
export type IconSetMeta = { prefix: string; iconify: string; name: string; license: string; count: number; group: "line" | "filled" | "colour" | "brands"; chunks?: number };
export type IconSet = { p: string; w: number; h: number; i: Record<string, string | [string, number, number]> };
export type IconSvg = { body: string; w: number; h: number };

const cache = new Map<string, Promise<unknown>>();
const load = <T,>(path: string): Promise<T> => {
  if (!cache.has(path)) cache.set(path, fetch(`/design-assets/${path}`, { cache: "force-cache" }).then(r => { if (!r.ok) throw new Error(`asset ${path}`); return r.json(); })
    .catch(e => { cache.delete(path); throw e; }));
  return cache.get(path) as Promise<T>;
};
export const loadIndex = () => load<{ fonts: number; emoji: number; iconSets: IconSetMeta[] }>("index.json");
export const loadFonts = () => load<FontMeta[]>("fonts.json");
export const loadEmoji = () => load<EmojiMeta[]>("emoji.json");
/** A set may be split into chunk files (icons/<id>.0.json …); they load in parallel and merge. */
export const loadIconSet = async (meta: Pick<IconSetMeta, "prefix" | "chunks">): Promise<IconSet> => {
  const n = meta.chunks ?? 1;
  if (n <= 1) return load<IconSet>(`icons/${meta.prefix}.json`);
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => load<IconSet>(`icons/${meta.prefix}.${i}.json`)));
  return { ...parts[0]!, i: Object.assign({}, ...parts.map(x => x.i)) };
};

export const iconOf = (set: IconSet, name: string): IconSvg | null => {
  const v = set.i[name]; if (!v) return null;
  return typeof v === "string" ? { body: v, w: set.w, h: set.h } : { body: v[0], w: v[1], h: v[2] };
};
/** Standalone SVG markup for an icon; `currentColor` in the source follows the layer colour. */
export const iconMarkup = (s: IconSvg, color = "currentColor") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.w} ${s.h}" width="100%" height="100%" style="color:${color}">${s.body}</svg>`;

/** Google Fonts CSS for any catalogue family, with the weights/italics requested. `text` limits the download to a preview string. */
export function fontCss(families: { family: string; weights?: number[]; italic?: boolean }[], text?: string) {
  const parts = families.filter(f => f.family).map(({ family, weights, italic }) => {
    const ws = [...new Set(weights?.length ? weights : [400])].sort((a, b) => a - b);
    const name = encodeURIComponent(family).replace(/%20/g, "+");
    return italic ? `family=${name}:ital,wght@${[...ws.map(w => `0,${w}`), ...ws.map(w => `1,${w}`)].join(";")}` : `family=${name}:wght@${ws.join(";")}`;
  });
  return parts.length ? `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ""}` : "";
}
