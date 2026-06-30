// POST /api/r2/presign — generate a presigned PUT URL for direct browser-to-R2 upload.
// Auth-protected: must be an authenticated workspace member.
// The object key is always server-generated (never client-supplied) to prevent path traversal.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { r2Configured, r2Key, r2PresignedPut } from "@/lib/storage/r2";

const ALLOWED_KINDS = ["event-cover", "event-media", "venue-cover", "supplier-logo", "profile-avatar"] as const;
type UploadKind = (typeof ALLOWED_KINDS)[number];

const ALLOWED_CONTENT_TYPES: Record<UploadKind, readonly string[]> = {
  "event-cover":     ["image/jpeg", "image/png", "image/webp"],
  "event-media":     ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"],
  "venue-cover":     ["image/jpeg", "image/png", "image/webp"],
  "supplier-logo":   ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  "profile-avatar":  ["image/jpeg", "image/png", "image/webp"],
};

const MAX_BYTES: Record<UploadKind, number> = {
  "event-cover":    10 * 1024 * 1024, // 10 MB
  "event-media":    50 * 1024 * 1024, // 50 MB
  "venue-cover":    10 * 1024 * 1024,
  "supplier-logo":   5 * 1024 * 1024,
  "profile-avatar":  5 * 1024 * 1024,
};

export async function POST(request: NextRequest) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 storage is not configured" }, { status: 503 });
  }

  // Auth: require authenticated Supabase session
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { workspaceId?: string; recordId?: string; kind?: string; filename?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workspaceId, recordId, kind, filename, contentType } = body;

  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (!kind || !ALLOWED_KINDS.includes(kind as UploadKind)) {
    return NextResponse.json({ error: `kind must be one of: ${ALLOWED_KINDS.join(", ")}` }, { status: 400 });
  }
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (!contentType || typeof contentType !== "string") {
    return NextResponse.json({ error: "contentType is required" }, { status: 400 });
  }

  const uploadKind = kind as UploadKind;

  // Validate content type for this kind
  if (!ALLOWED_CONTENT_TYPES[uploadKind].includes(contentType)) {
    return NextResponse.json(
      { error: `contentType '${contentType}' is not allowed for kind '${kind}'` },
      { status: 400 }
    );
  }

  // Verify the user is a member of the specified workspace (workspace ownership check)
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generate a server-side scoped key — never trust client path
  const objectKey = r2Key({ workspaceId, kind, recordId, filename });

  try {
    const result = await r2PresignedPut({
      key: objectKey,
      contentType,
      maxBytes: MAX_BYTES[uploadKind],
    });

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      objectKey: result.objectKey,
      publicUrl: result.publicUrl,
      expiresIn: 300,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Presign failed";
    console.error("[r2/presign] error:", msg);
    return NextResponse.json({ error: "Could not generate upload URL" }, { status: 500 });
  }
}

// Only POST — no GET/PUT/DELETE
export const dynamic = "force-dynamic";
