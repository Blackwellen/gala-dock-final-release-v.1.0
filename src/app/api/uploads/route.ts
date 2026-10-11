import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const MAX_BYTES = 10 * 1024 * 1024;

/** Identifies the real file type from its leading bytes; the browser-supplied type is ignored. */
function sniff(bytes: Uint8Array) {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", type: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { ext: "jpg", type: "image/jpeg" };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { ext: "webp", type: "image/webp" };
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { ext: "pdf", type: "application/pdf" };
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
  if (!(file instanceof File) || (purpose !== "image" && purpose !== "document")) return json({ error: "Choose a file to upload." }, 400);
  if (file.size === 0 || file.size > MAX_BYTES) return json({ error: "Files must be smaller than 10MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind || (purpose === "image" && kind.type === "application/pdf")) return json({ error: purpose === "image" ? "Upload a PNG, JPG or WebP image." : "Upload a PDF, PNG or JPG document." }, 415);
  const path = `${user.id}/${randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage.from("workspace-files").upload(path, bytes, { contentType: kind.type, upsert: false });
  if (error && /quota|P0001/i.test(error.message)) return json({ error: "Storage is full for this workspace. Delete files or upgrade your plan in Settings → Payments & Billing." }, 413);
  if (error) return json({ error: "Upload failed. Please try again." }, 500);
  const { data } = kind.type.startsWith("image/") ? await supabase.storage.from("workspace-files").createSignedUrl(path, 3600) : { data: null };
  return json({ path, name: file.name.slice(0, 120), url: data?.signedUrl ?? null });
}
