// POST /api/r2/presign-download — generate a presigned GET URL for a private
// R2 object (e.g. a supplier compliance document). Auth-protected: the
// caller must be an authenticated member of the workspace that owns the
// object key. The key must be prefixed with `${workspaceId}/` — this is how
// r2Key() scopes every upload, so it doubles as an authorization check
// without needing a separate lookup table of object ownership.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { r2Configured, r2PresignedGet } from "@/lib/storage/r2";

export async function POST(request: NextRequest) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 storage is not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { workspaceId?: string; objectKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workspaceId, objectKey } = body;
  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "objectKey is required" }, { status: 400 });
  }

  // Object keys are always generated server-side as `${workspaceId}/...` by
  // r2Key() — reject anything that doesn't match this workspace's prefix.
  const safeWorkspaceId = workspaceId.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!objectKey.startsWith(`${safeWorkspaceId}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Message attachments carry an extra authorization layer beyond workspace
  // membership: the caller must be a participant of the conversation the
  // attachment belongs to (enforced here explicitly since the download URL
  // is minted via service-independent object-key prefix matching above,
  // which does not by itself consult conversation_participants/RLS).
  if (objectKey.split("/")[1] === "message-attachment") {
    const { data: attachment } = await supabase
      .from("message_attachments")
      .select("conversation_id")
      .eq("workspace_id", workspaceId)
      .eq("r2_key", objectKey)
      .maybeSingle();

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: isParticipant } = await supabase.rpc("is_conversation_participant", {
      p_conversation_id: attachment.conversation_id,
    });
    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const downloadUrl = await r2PresignedGet({ key: objectKey });
    return NextResponse.json({ downloadUrl, expiresIn: 300 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Presign failed";
    console.error("[r2/presign-download] error:", msg);
    return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
