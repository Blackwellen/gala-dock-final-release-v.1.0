import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Server-side platform-admin resolution — the isolated counterpart to src/lib/workspace.ts and
 * src/lib/customer.ts. A platform admin is NOT a workspace_role and NOT a customer; grant/revocation
 * is delegated entirely to the existing `is_platform_admin(_uid)` Postgres function (and its
 * companion `platform_admin_not_before` revocation-cutoff table) rather than reimplemented here —
 * that function is the single source of truth for who is an admin.
 */

export interface AdminContext {
  user: User;
}

/**
 * Require an authenticated platform admin. Redirects to /admin/login when unauthenticated or when
 * the signed-in user fails the is_platform_admin() check (never silently renders admin UI for a
 * non-admin session).
 */
export async function requirePlatformAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin", { _uid: user.id });
  if (error || !isAdmin) redirect("/admin/login?denied=1");

  return { user };
}
