import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { checkUpload, verdictMessage } from "@/lib/upload-safety";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { safeFileName, validateUpload, type FileClass } from "@/lib/files/policy";
import { enqueue, registerFile } from "@/lib/files/service";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Stores a file in the caller's private folder. Purpose controls which types are accepted. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to upload files." }, 401);
  if (!(await hasRequiredAssurance(supabase))) return json({ error: "Complete multi-factor authentication first." }, 403);
  if (!(await rateLimit(`uploads:${user.id}`, 30, 600))) return json({ error: "Too many uploads. Please wait a few minutes." }, 429);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const purpose = form?.get("purpose");
  if (!(file instanceof File) || (purpose !== "image" && purpose !== "document" && purpose !== "element")) return json({ error: "Choose a file to upload." }, 400);
  if (file.size === 0 || file.size > 10 * 1024 * 1024) return json({ error: "Files must be smaller than 10MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // GIF and SVG are accepted only as Media Studio elements; documents and images keep their original types.
  const allowed = purpose === "element" ? ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] : purpose === "image" ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg", "image/webp", "application/pdf"];
  // Q04: real type from magic bytes, declared type must agree, no markup hidden in binary images.
  const fileClass: FileClass = purpose === "document" ? "private_document" : "private_image";
  const checked = validateUpload({ bytes, declaredType: file.type, fileClass, allowed });
  if (!checked.ok && checked.code === "mime_mismatch") return json({ error: "This file isn’t the type it claims to be." }, 415);
  if (!checked.ok && checked.code === "polyglot") return json({ error: "This image contains embedded content and can’t be uploaded." }, 422);
  const kind = checked.ok ? checked.kind : null;
  if (!kind) return json({ error: purpose === "element" ? "Upload a PNG, JPG, WebP, GIF or SVG." : purpose === "image" ? "Upload a PNG, JPG or WebP image." : "Upload a PDF, PNG or JPG document." }, 415);
  const safe = await checkUpload(bytes, kind.type);   // strip metadata, refuse active PDFs, malware scan when configured
  if (!safe.ok) return json({ error: verdictMessage(safe) }, safe.reason === "scanner_unavailable" ? 503 : 422);
  const path = `${user.id}/${randomUUID()}.${kind.ext}`;
  const { data:uploaded,error } = await supabase.storage.from("workspace-files").upload(path, safe.bytes, { contentType: kind.type, upsert: false });
  if (error && /quota|P0001/i.test(error.message)) return json({ error: "Storage is full for this workspace. Delete files or upgrade your plan in Settings → Payments & Billing." }, 413);
  if (error) return json({ error: "Upload failed. Please try again." }, 500);
  const admin=createAdminClient();
  if(!uploaded?.id){await admin.storage.from("workspace-files").remove([path]);return json({error:"Could not verify the uploaded object. Try again."},500);}
  const proof=await untyped(admin).from("verified_private_uploads").insert({path,object_id:uploaded?.id,owner_id:user.id,mime:kind.type,size_bytes:safe.bytes.length,sha256:createHash("sha256").update(safe.bytes).digest("hex")});
  if(proof.error){await admin.storage.from("workspace-files").remove([path]);return json({error:"Could not verify the upload. Try again."},500);}
  // Q04 metadata + quarantine: documents fail closed until the ClamAV gateway returns clean (not configured → quarantined).
  const kindClass: FileClass = kind.type === "application/pdf" ? "private_document" : "private_image";
  const reg = await registerFile(admin, { bucket: "workspace-files", name: path, fileClass: kindClass, sniffed: kind.type, declared: file.type, bytes: safe.bytes, displayName: safeFileName(file.name) }).catch(() => null);
  if (!reg) { await admin.storage.from("workspace-files").remove([path]); return json({ error: "Could not record the upload. Try again." }, 500); }
  if (reg.decision === "quarantined") await enqueue(admin, "files.scan", { bucket: "workspace-files", name: path }, `files.scan:workspace-files/${path}`);
  const { data } = kind.type.startsWith("image/") ? await supabase.storage.from("workspace-files").createSignedUrl(path, 3600) : { data: null };
  return json({ path, name: safeFileName(file.name), url: data?.signedUrl ?? null, status: reg.decision === "ok" ? "ready" : "checking" });
}
