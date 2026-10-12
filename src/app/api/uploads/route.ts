import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { checkUpload, verdictMessage } from "@/lib/upload-safety";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const MAX_BYTES = 10 * 1024 * 1024;

/** Identifies the real file type from its leading bytes; the browser-supplied type is ignored. */
function sniff(bytes: Uint8Array) {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", type: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { ext: "jpg", type: "image/jpeg" };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: "webp", type: "image/webp" };
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { ext: "pdf", type: "application/pdf" };
  if (starts(0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return { ext: "gif", type: "image/gif" };
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return { ext: "svg", type: "image/svg+xml" };
  return null;
}

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
  if (file.size === 0 || file.size > MAX_BYTES) return json({ error: "Files must be smaller than 10MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  // GIF and SVG are accepted only as Media Studio elements; documents and images keep their original types.
  const allowed = purpose === "element" ? ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] : purpose === "image" ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg", "image/webp", "application/pdf"];
  if (!kind || !allowed.includes(kind.type)) return json({ error: purpose === "element" ? "Upload a PNG, JPG, WebP, GIF or SVG." : purpose === "image" ? "Upload a PNG, JPG or WebP image." : "Upload a PDF, PNG or JPG document." }, 415);
  const safe = await checkUpload(bytes, kind.type);   // strip metadata, refuse active PDFs, malware scan when configured
  if (!safe.ok) return json({ error: verdictMessage(safe) }, safe.reason === "scanner_unavailable" ? 503 : 422);
  const path = `${user.id}/${randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage.from("workspace-files").upload(path, safe.bytes, { contentType: kind.type, upsert: false });
  if (error && /quota|P0001/i.test(error.message)) return json({ error: "Storage is full for this workspace. Delete files or upgrade your plan in Settings → Payments & Billing." }, 413);
  if (error) return json({ error: "Upload failed. Please try again." }, 500);
  const { data } = kind.type.startsWith("image/") ? await supabase.storage.from("workspace-files").createSignedUrl(path, 3600) : { data: null };
  return json({ path, name: file.name.slice(0, 120), url: data?.signedUrl ?? null });
}
