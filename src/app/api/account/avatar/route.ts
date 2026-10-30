import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, sameOrigin } from "@/lib/security";
import { checkUpload, verdictMessage } from "@/lib/upload-safety";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFileName, validateUpload, PUBLIC_IMAGE_TYPES } from "@/lib/files/policy";
import { registerFile } from "@/lib/files/service";

const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { "Cache-Control": "private, no-store" } });
/** Uploads a profile photo (PNG/JPG/WebP ≤5MB, type sniffed from bytes) to the caller's public avatar folder. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!(await rateLimit(`avatar:${user.id}`, 10, 600))) return json({ error: "Too many uploads. Try again shortly." }, 429);
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) return json({ error: "Choose an image under 5MB." }, 400);
  const b = new Uint8Array(await file.arrayBuffer());
  const v = validateUpload({ bytes: b, declaredType: file.type, fileClass: "public_media", allowed: PUBLIC_IMAGE_TYPES });   // Q04 magic bytes / MIME / polyglot
  if (!v.ok) return json({ error: v.code === "polyglot" ? "This image contains embedded content." : "Upload a PNG, JPG or WebP image." }, v.status);
  const ext = v.kind.ext;
  const safe = await checkUpload(b, v.kind.type);
  if (!safe.ok) return json({ error: verdictMessage(safe) }, safe.reason === "scanner_unavailable" ? 503 : 422);
  const path = `${user.id}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();   // the route authorises (own folder only); clients never write public buckets
  const { error } = await admin.storage.from("avatars").upload(path, safe.bytes, { contentType: v.kind.type, upsert: false });
  if (error && /quota|P0001/i.test(error.message)) return json({ error: "Storage is full for this workspace. Delete files or upgrade your plan in Settings → Payments & Billing." }, 413);
  if (error) return json({ error: "Upload failed." }, 500);
  await registerFile(admin, { bucket: "avatars", name: path, fileClass: "public_media", sniffed: v.kind.type, declared: file.type, bytes: safe.bytes, displayName: safeFileName(file.name, "avatar") }).catch(e => console.error("file_register_failed", (e as Error).message));
  const url = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error: e2 } = await supabase.rpc("set_my_avatar", { p_url: url });
  if (e2) return json({ error: "Could not set your photo." }, 500);
  return json({ url });
}
