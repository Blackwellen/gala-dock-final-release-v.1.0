import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { checkUpload, verdictMessage } from "@/lib/upload-safety";
import { safeFileName, validateUpload, PUBLIC_IMAGE_TYPES } from "@/lib/files/policy";
import { storePublicMedia } from "@/lib/files/service";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const MESSAGES: Record<string, string> = { too_large: "Images must be smaller than 10MB.", empty: "Choose an image to upload.", unknown_type: "Upload a PNG, JPG or WebP image.",
  type_not_allowed: "Upload a PNG, JPG or WebP image.", mime_mismatch: "This file isn’t the type it claims to be.", polyglot: "This image contains embedded content and can’t be published." };

/**
 * Q04 public media upload (event posters, ticket maps). Replaces direct browser → public bucket uploads: the server checks
 * workspace membership, real type from magic bytes (PNG/JPEG/WebP only — never SVG), declared-vs-real MIME, polyglot markers,
 * strips metadata (EXIF/GPS) and scans when the ClamAV gateway is configured, before anything becomes publicly reachable.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to upload files." }, 401);
  if (!(await hasRequiredAssurance(supabase))) return json({ error: "Complete multi-factor authentication first." }, 403);
  if (!(await rateLimit(`public-media:${user.id}`, 40, 600))) return json({ error: "Too many uploads. Please wait a few minutes." }, 429);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file"), workspace = String(form?.get("workspace") ?? "");
  if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(workspace)) return json({ error: "Choose an image to upload." }, 400);
  const { data: member } = await supabase.rpc("is_workspace_member" as never, { target: workspace } as never);
  if (member !== true) return json({ error: "You can’t upload to this workspace." }, 403);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateUpload({ bytes, declaredType: file.type, fileClass: "public_media", allowed: PUBLIC_IMAGE_TYPES });
  if (!v.ok) return json({ error: MESSAGES[v.code], code: v.code }, v.status);
  const safe = await checkUpload(bytes, v.kind.type);
  if (!safe.ok) return json({ error: verdictMessage(safe) }, safe.reason === "scanner_unavailable" ? 503 : 422);
  const out = await storePublicMedia(createAdminClient(), { workspaceId: workspace, bytes: safe.bytes, type: v.kind.type, ext: v.kind.ext, displayName: safeFileName(file.name, "image"), userId: user.id });
  if ("error" in out) return json({ error: /quota|P0001/i.test(out.error ?? "") ? "Storage is full for this workspace." : "Upload failed. Please try again." }, /quota|P0001/i.test(out.error ?? "") ? 413 : 500);
  return json({ path: out.name, url: out.url });
}
