/** Canonical public origin for metadata, sitemap and robots. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.galadock.com").replace(/\/$/, "");
}
