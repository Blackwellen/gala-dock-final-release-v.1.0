/** Public event page blocks (order/visibility are stored in events.settings.page_blocks). The hero is always rendered first.
 *  This order is the default layout (PUB-239) for events that never saved one, so the editor and the public page agree. */
export const BLOCKS = ["hero", "about", "tickets", "performers", "programme", "venue", "getting_there", "map", "organiser", "accessibility", "sponsors", "gallery", "faqs", "related"] as const;
export type Block = typeof BLOCKS[number];

/** events.settings.public_page (Sell › Public page toggles) keys that also switch a block off. */
const PAGE_TOGGLE: Partial<Record<Block, string>> = { about: "details", tickets: "tickets", performers: "lineup", map: "map", faqs: "faqs" };

/** One visibility rule for the public page and the editor: a block shows unless page_blocks.visible or the Sell toggle turned it off. The hero always shows. */
export function blockVisible(settings: Record<string, unknown> | null | undefined, b: Block): boolean {
  if (b === "hero") return true;
  const s = settings ?? {};
  const vis = (s.page_blocks as { visible?: Record<string, boolean> } | undefined)?.visible ?? {};
  const page = (s.public_page ?? {}) as Record<string, boolean>;
  const t = PAGE_TOGGLE[b];
  return vis[b] !== false && !(t && page[t] === false);
}

/** Saved order (unknown keys dropped); a block it doesn't mention (e.g. one added after the order was saved) goes in at its default
 *  position — right after its nearest default predecessor that is in the order, or first if none is. The hero is always first. */
export function blockOrder(settings: Record<string, unknown> | null | undefined): Block[] {
  const saved = ((settings?.page_blocks as { order?: string[] } | undefined)?.order ?? []).filter((b): b is Block => (BLOCKS as readonly string[]).includes(b));
  const order: Block[] = [...new Set(saved)].filter(b => b !== "hero");
  BLOCKS.forEach((b, i) => {
    if (b === "hero" || order.includes(b)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = order.indexOf(BLOCKS[j]!); if (k >= 0) { at = k + 1; break; } }
    order.splice(at, 0, b);
  });
  return ["hero", ...order];
}
