import { createClient } from "@/lib/supabase/server";
import { SiteHeaderBar } from "./site-header-bar";
import "@/styles/public-site.css";

/**
 * The one global public header (blueprint §1.4): Gala Dock lockup, the six public routes, Sign in + Get Started.
 * Signed-in visitors get their avatar instead of the auth actions. A transient auth/profile failure (e.g. a Supabase 520) must
 * never take the header — or the page — down: it renders the signed-out header instead.
 */
export async function SiteHeader() {
  const supabase = await createClient();
  const user = await supabase.auth.getUser().then(r => r.data.user, () => null);
  const { data: p } = user
    ? await supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle().then(r => r, () => ({ data: null }))
    : { data: null };
  const name = p?.full_name || user?.email?.split("@")[0] || "";
  return <SiteHeaderBar account={user ? { initial: name.slice(0, 1).toUpperCase() || "G", avatar: p?.avatar_url ?? null } : null} />;
}
