import { SiteHeader } from "@/components/site/site-header";

/** Public pages (events, venues, services, organisers, help, legal, 404, token-chrome pages) share the one global public header
 *  defined by the public website blueprint (§1.4). Kept under this name so existing layouts need no change. */
export async function PublicHeader() {
  return <SiteHeader />;
}
