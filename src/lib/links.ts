/** Public profile URL for a marketplace listing (pages owned by the public site: /venues/[slug], /services/[slug]). */
export function listingHref(kind: string | null | undefined, slug: string | null | undefined, id: string) {
  return `/${kind === "venue" ? "venues" : "services"}/${slug || id}`;
}
