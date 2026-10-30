import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { "Cache-Control": "private, no-store" } });

/**
 * Q05 unified inbox. Reads the canonical views (inbox_threads / inbox_messages, security_invoker) with the caller's session, so
 * RLS on conversations and on legacy threads decides visibility. GET → threads; GET ?thread=<id> → that thread's messages
 * (legacy messages of a linked thread appear once, under the canonical conversation).
 */
export async function GET(request: Request) {
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  const thread = new URL(request.url).searchParams.get("thread");
  if (thread) {
    if (!/^[0-9a-f-]{36}$/i.test(thread)) return json({ error: "Not found" }, 404);
    const { data, error } = await sb.from("inbox_messages").select("id,thread_id,source,sender_id,sender_name,body,attachments,created_at").eq("thread_id", thread).order("created_at").limit(500);
    if (error) return json({ error: "Couldn’t load messages." }, 500);
    return json({ messages: data ?? [] });
  }
  const { data, error } = await sb.from("inbox_threads").select("id,source,kind,subject,event_id,listing_id,build_item_id,context_key,last_message_at,preview").order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
  if (error) return json({ error: "Couldn’t load the inbox." }, 500);
  return json({ threads: data ?? [] });
}
