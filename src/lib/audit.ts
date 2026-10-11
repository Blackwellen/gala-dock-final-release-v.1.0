import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Append an audit event. Call only after the caller has been authorised for the action. Never throws. */
export async function writeAudit(actorId: string, workspaceId: string | null, event: string, metadata: Record<string, unknown> = {}) {
  if (!/^[a-z_]+\.[a-z_]+$/.test(event)) return;
  try { await createAdminClient().from("audit_events").insert({ actor_id: actorId, workspace_id: workspaceId, event, metadata: metadata as never }); } catch { /* audit is best-effort; never block the user action */ }
}
