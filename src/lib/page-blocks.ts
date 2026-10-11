/** Public event page blocks (order/visibility are stored in events.settings.page_blocks). */
export const BLOCKS = ["hero", "about", "programme", "performers", "venue", "tickets", "accessibility", "organiser", "sponsors", "faqs", "gallery", "related"] as const;
export type Block = typeof BLOCKS[number];
