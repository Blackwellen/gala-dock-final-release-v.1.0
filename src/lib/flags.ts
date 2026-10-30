import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature flags (backend domain 24) — the ONE canonical evaluator is public.feature_enabled(flag, workspace) in Postgres.
 * Definitions: published platform_settings section "flags" (versioned, admin-published, rollback via admin_rollback_setting).
 * Workspace overrides / beta: workspaces.settings.flags (server-side only, admin_set_workspace_flag).
 * Evaluated as the signed-in user: a workspace the caller does not belong to is ignored, so flags never leak tenant state.
 * Unknown flags and any evaluation error resolve to false (fail closed).
 */
export async function featureEnabled(flag: string, workspaceId?: string | null): Promise<boolean> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("feature_enabled" as never, { p_flag: flag, p_workspace: workspaceId ?? null } as never);
    return !error && data === true;
  } catch {
    return false;
  }
}
