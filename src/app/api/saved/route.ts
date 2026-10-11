import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to save your favorites." }, { status: 401 });
  if (!(await hasRequiredAssurance(supabase))) return NextResponse.json({ error: "Complete multi-factor authentication first." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string" || body.key.length > 120 || typeof body.saved !== "boolean") return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const result = body.saved ? await supabase.from("saved_items").upsert({ user_id: user.id, item_key: body.key }) : await supabase.from("saved_items").delete().eq("user_id",user.id).eq("item_key",body.key);
  return NextResponse.json(result.error ? { error: "Could not save this item." } : { saved: body.saved }, { status: result.error ? 500 : 200 });
}
