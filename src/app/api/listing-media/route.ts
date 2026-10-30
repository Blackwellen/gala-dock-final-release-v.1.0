import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { checkUpload, verdictMessage } from "@/lib/upload-safety";
import { getProvider } from "@/lib/provider/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFileName, validateUpload, PUBLIC_IMAGE_TYPES } from "@/lib/files/policy";
import { enqueue, registerFile } from "@/lib/files/service";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Uploads a public listing photo into the active provider workspace's folder (owner/manager checked here). Q04: magic bytes, declared MIME,
 *  polyglot check, metadata strip and scan run before the server (service role) stores it, so no client ever writes a public bucket. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to upload photos." }, 401);
  if (!(await hasRequiredAssurance(supabase))) return json({ error: "Complete multi-factor authentication first." }, 403);
  if (!(await rateLimit(`listing-media:${user.id}`, 60, 600))) return json({ error: "Too many uploads. Please wait a few minutes." }, 429);
  const { workspace, role } = await getProvider();
  if (!["owner", "manager"].includes(role)) return json({ error: "Only owners and managers can change listing photos." }, 403);
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return json({ error: "Choose a photo to upload." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateUpload({ bytes, declaredType: file.type, fileClass: "public_media", allowed: PUBLIC_IMAGE_TYPES });
  if (!v.ok) return json({ error: v.code === "too_large" || v.code === "empty" ? "Photos must be smaller than 10MB." : v.code === "polyglot" ? "This image contains embedded content and can’t be published." : "Upload a PNG, JPG or WebP image." }, v.status);
  const kind = v.kind;
  const safe = await checkUpload(bytes, kind.type);
  if (!safe.ok) return json({ error: verdictMessage(safe) }, safe.reason === "scanner_unavailable" ? 503 : 422);
  const path = `${workspace.id}/${randomUUID()}.${kind.ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("listing-media").upload(path, safe.bytes, { contentType: kind.type, upsert: false });
  if (error && /quota|P0001/i.test(error.message)) return json({ error: "Storage is full for this workspace. Delete files or upgrade your plan in Settings → Payments & Billing." }, 413);
  if (error) return json({ error: "Upload failed. Please try again." }, 500);
  await registerFile(admin, { bucket: "listing-media", name: path, fileClass: "public_media", sniffed: kind.type, declared: file.type, bytes: safe.bytes, displayName: safeFileName(file.name, "photo") }).catch(e => console.error("file_register_failed", (e as Error).message));
  await enqueue(admin, "files.derive", { bucket: "listing-media", name: path }, `files.derive:listing-media/${path}`);
  return json({ url: admin.storage.from("listing-media").getPublicUrl(path).data.publicUrl });
}
