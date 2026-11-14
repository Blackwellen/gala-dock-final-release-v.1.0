import { loadSiteAccount } from "./site-account";
import { SiteHeaderBar } from "./site-header-bar";
import "@/styles/public-site.css";

/**
 * The one global public header (blueprint §1.4): Gala Dock lockup, the six public routes, Sign in + Get Started.
 * Signed-in visitors get an account menu (Q69) instead of the auth actions. loadSiteAccount() is cached per request and returns
 * null on any auth/profile failure (e.g. a Supabase 520), so the header — and the page — falls back to the signed-out state.
 */
export async function SiteHeader() {
  return <SiteHeaderBar account={await loadSiteAccount()} />;
}
