import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { getProvider } from "@/lib/provider/context";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const MAX_BYTES = 10 * 1024 * 1024;

function sniff(b: Uint8Array) {
  const starts = (...sig: number[]) => sig.every((x, i) => b[i] === x);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", type: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { ext: "jpg", type: "image/jpeg" };
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", type: "image/webp" };
  return null;
}

/** Uploads a public listing photo into the active provider workspace's folder. Storage RLS also requires owner/manager on that workspace. */
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
  if (file.size === 0 || file.size > MAX_BYTES) return json({ error: "Photos must be smaller than 10MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return json({ error: "Upload a PNG, JPG or WebP image." }, 415);
  const path = `${workspace.id}/${randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage.from("listing-media").upload(path, bytes, { contentType: kind.type, upsert: false });
  if (error) return json({ error: "Upload failed. Please try again." }, 500);
  return json({ url: supabase.storage.from("listing-media").getPublicUrl(path).data.publicUrl });
}
