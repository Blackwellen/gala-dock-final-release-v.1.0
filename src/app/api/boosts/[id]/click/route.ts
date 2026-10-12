import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Sponsored placement click: records the click (active boosts only, bounded definer RPC) then redirects to the event page.
 *  Only same-site /events/<slug> targets are allowed, so this can't be used as an open redirect. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "/discover";
  const target = /^\/events\/[a-z0-9-]{1,120}$/i.test(to) ? to : "/discover";
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const sb = await createClient();
    await sb.rpc("record_boost_event", { p_boost: id, p_kind: "click" }).then(() => null, () => null);
  }
  return NextResponse.redirect(new URL(target, url.origin), 302);
}
