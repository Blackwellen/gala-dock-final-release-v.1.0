import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { initialOf, seatsFrom, type SeatAccess, type SiteAccount } from "./account-links";

/* Q69: everything the public header's account menu needs, in one round of parallel reads through the visitor's own RLS client.
   cache() dedupes it per request (header + mobile menu + any page asking). Public pages are already dynamically rendered (the root
   layout reads the per-request CSP nonce from headers(), and this header has always read the session cookie), so loading here does
   not cost any page its static rendering. Every read is best-effort: a failed side query just drops that item; a failed session or
   profile read returns null and the header renders the plain signed-out state instead of failing the page. */
const settle = <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => Promise.resolve(p).then(v => v, () => fallback);

export const loadSiteAccount = cache(async (): Promise<SiteAccount | null> => {
  try {
    const supabase = await createClient();
    const user = await settle(supabase.auth.getUser().then(r => r.data.user), null);
    if (!user) return null;
    const [profile, access, admin, partner, notes, convos] = await Promise.all([
      settle(supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle().then(r => (r.error ? undefined : r.data)), undefined),
      settle(supabase.rpc("my_workspace_access").then(r => (r.data ?? []) as SeatAccess[]), [] as SeatAccess[]),
      settle(supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle().then(r => !!r.data), false),
      settle(supabase.from("partners").select("id").eq("user_id", user.id).neq("status", "terminated").limit(1).maybeSingle().then(r => !!r.data), false),
      settle(supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null).then(r => r.count ?? 0), 0),
      settle(supabase.rpc("my_conversations", { p_limit: 20 }).then(r => (r.data ?? []) as { unread?: boolean | null }[]), [] as { unread?: boolean | null }[]),
    ]);
    if (profile === undefined) return null; // profile read failed (not merely missing): plain Sign in state, never a half-built menu
    const email = user.email ?? "";
    const name = profile?.full_name || (user.user_metadata?.full_name as string | undefined) || email.split("@")[0] || "Your account";
    return {
      name, email, initial: initialOf(name), avatar: profile?.avatar_url ?? null,
      seats: seatsFrom(access, { admin, partner }),
      unreadMessages: convos.some(c => c.unread === true),
      notifications: notes,
    };
  } catch {
    return null;
  }
});
