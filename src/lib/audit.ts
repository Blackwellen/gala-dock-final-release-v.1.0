import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentCorrelationId } from "@/lib/observability/context";
import { requestCorrelationId } from "@/lib/observability/http";

/**
 * Append an audit event. Call only after the caller has been authorised for the action. Never throws.
 * Catalogued workspace events (src/lib/foundation/event-catalogue.ts) are captured into the domain outbox in the same
 * transaction; the request's correlation id is filled in automatically (Q34) unless one is passed.
 */
export async function writeAudit(actorId: string, workspaceId: string | null, event: string, metadata: Record<string, unknown> = {}, o: { correlationId?: string } = {}) {
  if (!/^[a-z_]+\.[a-z_]+$/.test(event)) return;
  try {
    // Q34: without an explicit id, the active observability context (worker/job/route) or the proxy-set request header is used,
    // so audit rows — and the outbox events captured from them — carry the request's correlation id automatically.
    const correlation = o.correlationId ?? currentCorrelationId() ?? await requestCorrelationId();
    await createAdminClient().from("audit_events").insert({ actor_id: actorId, workspace_id: workspaceId, event, metadata: metadata as never, correlation_id: correlation } as never);
  } catch { /* audit is best-effort; never block the user action */ }
}
