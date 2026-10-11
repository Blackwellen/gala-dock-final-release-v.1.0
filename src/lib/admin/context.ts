import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { untyped, one, type Db } from "@/lib/workspace/db";

export const adminPermissions = ["support", "trust", "commerce", "users", "workspaces", "events", "marketplace", "tickets",
  "partners", "settings", "agent_ops", "analytics", "audit", "support.break_glass_conversation.read"] as const;
export type AdminPermission = typeof adminPermissions[number];

export type AdminContext = { db: Db; userId: string; name: string; title: string; avatar: string; permissions: Set<AdminPermission> };

/**
 * Platform Admin guard. requireRole("admin") already enforces a platform_admins row and a verified second factor (aal2).
 * Admin users are not all-powerful: each area additionally checks its own permission.
 */
export const getAdmin = cache(async (): Promise<AdminContext> => {
  const { supabase, user } = await requireRole("admin");
  const db = untyped(supabase);
  const [admin, profile] = await Promise.all([
    one<{ title: string; permissions: AdminPermission[] }>(db.from("platform_admins").select("title,permissions").eq("user_id", user.id).maybeSingle()),
    one<{ full_name: string; avatar_url: string }>(db.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle()),
  ]);
  if (!admin) redirect("/admin/login?reason=insufficient");
  return {
    db, userId: user.id, title: admin.title, avatar: profile?.avatar_url ?? "",
    name: profile?.full_name || user.email?.split("@")[0] || "Admin",
    permissions: new Set(admin.permissions),
  };
});

/** Use at the top of every Admin page. Missing permission renders the restricted state, not a redirect loop. */
export async function requireAdminPermission(permission: AdminPermission) {
  const ctx = await getAdmin();
  return { ...ctx, allowed: ctx.permissions.has(permission) };
}
