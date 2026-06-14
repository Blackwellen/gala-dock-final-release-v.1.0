import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Portal token resolution.
 *
 * The existing `portal_links` table stores a SHA-256 *hash* of the share token
 * (`token_hash`), never the plaintext. A planner shares a URL like
 * `/portal/<plaintext-token>`; we hash the inbound token the same way and look
 * for a matching, non-revoked, non-expired link. This keeps us inside the
 * existing schema and avoids exposing other workspaces' data — a token only ever
 * resolves to the single event it was minted for.
 */

export interface ResolvedPortal {
  workspaceId: string;
  eventId: string | null;
  linkId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolvePortalToken(token: string): Promise<ResolvedPortal | null> {
  if (!token || token.length < 8) return null;
  const admin = createAdminClient();
  const tokenHash = hashToken(token);

  // Prefer portal_links (event-scoped, has event_id directly).
  const { data: link } = await admin
    .from("portal_links")
    .select("id, workspace_id, event_id, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (link) {
    if (link.revoked_at) return null;
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return null;
    return {
      workspaceId: link.workspace_id,
      eventId: link.event_id,
      linkId: link.id,
    };
  }

  // Fall back to the generic portal_tokens table (entity_type = 'event').
  const { data: tok } = await admin
    .from("portal_tokens")
    .select("id, workspace_id, entity_id, entity_type, revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tok) {
    if (tok.revoked_at) return null;
    if (tok.expires_at && new Date(tok.expires_at).getTime() < Date.now()) return null;
    return {
      workspaceId: tok.workspace_id,
      eventId: tok.entity_type === "event" ? tok.entity_id : null,
      linkId: tok.id,
    };
  }

  return null;
}

/** Best-effort view counter bump; never throws into the page render. */
export async function recordPortalView(linkId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("portal_links")
      .select("view_count")
      .eq("id", linkId)
      .maybeSingle();
    if (data) {
      await admin
        .from("portal_links")
        .update({
          view_count: (data.view_count ?? 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq("id", linkId);
    }
  } catch {
    /* non-fatal */
  }
}
