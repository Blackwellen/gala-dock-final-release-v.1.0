import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$/i;

/**
 * Message attachment download. RLS on conversation_messages decides who may see the message (participants only,
 * via can_access_conversation); the file must be attached to a visible message of this conversation. Then a 60-second signed URL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !PATH.test(path)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: entries } = await supabase.from("conversation_messages" as never).select("attachments").eq("conversation_id", id).filter("attachments", "cs", JSON.stringify([{ path }])).limit(1);
  const file = ((entries ?? []) as { attachments: { path: string; name: string }[] }[])[0]?.attachments.find(f => f.path === path);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await createAdminClient().storage.from("workspace-files").createSignedUrl(path, 60, /\.(png|jpe?g|webp)$/i.test(path) && new URL(req.url).searchParams.get("view") === "1" ? {} : { download: file.name.replace(/[^\w .()-]/g, "_") });
  if (error || !data) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
