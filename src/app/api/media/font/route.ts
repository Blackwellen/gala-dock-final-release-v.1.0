import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { rateLimit, sameOrigin } from "@/lib/security";
import { checkUpload, verdictMessage } from "@/lib/upload-safety";
import { untyped } from "@/lib/workspace/db";

// Custom brand fonts (media spec §35). Owners/managers upload with a licence acknowledgement; every workspace member can use them.
// Files stay in the private bucket and are streamed back only to members of the font's workspace.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024;

/** Real font type from the file signature; the browser's type and the file name are ignored. */
function sniffFont(b: Uint8Array) {
  const tag = String.fromCharCode(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0);
  if (tag === "wOF2") return { ext: "woff2", type: "font/woff2" };
  if (tag === "wOFF") return { ext: "woff", type: "font/woff" };
  if (tag === "OTTO") return { ext: "otf", type: "font/otf" };
  if ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || tag === "true") return { ext: "ttf", type: "font/ttf" };
  return null;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to upload fonts." }, 401);
  if (!(await hasRequiredAssurance(supabase))) return json({ error: "Complete multi-factor authentication first." }, 403);
  if (!(await rateLimit(`fonts:${user.id}`, 20, 3600))) return json({ error: "Too many font uploads. Try again later." }, 429);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file"), workspaceId = String(form?.get("workspaceId") ?? ""), family = String(form?.get("family") ?? "").trim();
  const weight = Number(form?.get("weight") ?? 400), style = form?.get("style") === "italic" ? "italic" : "normal";
  if (!(file instanceof File) || !UUID.test(workspaceId)) return json({ error: "Choose a font file." }, 400);
  if (form?.get("licence") !== "yes") return json({ error: "Confirm you have a licence to use this font." }, 400);
  if (!/^[A-Za-z0-9 \-]{2,60}$/.test(family)) return json({ error: "Font names can use letters, numbers, spaces and hyphens (2–60 characters)." }, 400);
  if (!Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100) return json({ error: "Choose a weight between 100 and 900." }, 400);
  if (file.size === 0 || file.size > MAX_BYTES) return json({ error: "Font files must be smaller than 5MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFont(bytes);
  if (!kind) return json({ error: "Upload a WOFF2, WOFF, TTF or OTF font file." }, 415);
  const { data: role } = await supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!role || !["owner", "manager"].includes(role.role)) return json({ error: "Only workspace owners and managers can add brand fonts." }, 403);
  const safe = await checkUpload(bytes, kind.type);
  if (!safe.ok) return json({ error: verdictMessage(safe) }, safe.reason === "scanner_unavailable" ? 503 : 422);
  const path = `${user.id}/${randomUUID()}.${kind.ext}`;
  const up = await supabase.storage.from("workspace-files").upload(path, safe.bytes, { contentType: kind.type, upsert: false });
  if (up.error && /quota|P0001/i.test(up.error.message)) return json({ error: "Storage is full for this workspace. Delete files or upgrade your plan in Settings → Payments & Billing." }, 413);
  if (up.error) return json({ error: "Upload failed. Please try again." }, 500);
  const { data, error } = await untyped(supabase as never).from("uploaded_fonts")
    .insert({ workspace_id: workspaceId, family, weight, style, path, licence_acknowledged: true, created_by: user.id }).select("id,family,weight,style").single();
  if (error) { await supabase.storage.from("workspace-files").remove([path]); return json({ error: "Couldn’t save the font." }, 500); }
  return json(data);
}

/** Streams a font to a member of its workspace (same origin, so @font-face and exports can use it without CORS). */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "Not found" }, 404);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  const { data: f } = await untyped(supabase as never).from("uploaded_fonts").select("path").eq("id", id).maybeSingle();   // RLS: workspace members only
  if (!f) return json({ error: "Not found" }, 404);
  const { data: blob } = await createAdminClient().storage.from("workspace-files").download(f.path as string);
  if (!blob) return json({ error: "Not found" }, 404);
  const ext = String(f.path).split(".").pop();
  return new NextResponse(blob, { headers: { "Content-Type": `font/${ext}`, "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: "Invalid request origin." }, 403);
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "Not found" }, 404);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  const { data: f } = await untyped(supabase as never).from("uploaded_fonts").delete().eq("id", id).select("path").maybeSingle();   // RLS: owners/managers
  if (!f) return json({ error: "You can’t remove this font." }, 403);
  await createAdminClient().storage.from("workspace-files").remove([f.path as string]);
  return json({ ok: true });
}
