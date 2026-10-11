import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Records that the signed-in user viewed an event or listing (powers "Recently viewed"). Anonymous calls are ignored. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 200 });
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  if (!/^(event|listing):[0-9a-f-]{36}$/i.test(key)) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const { error } = await supabase.from("recently_viewed").upsert({ user_id: user.id, item_key: key.toLowerCase(), viewed_at: new Date().toISOString() });
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
