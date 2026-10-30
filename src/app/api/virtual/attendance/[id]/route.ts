import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/virtual/join";

/** Attendance heartbeat / leave (Q29). POST {action:"heartbeat"|"leave"}; only the attendee's own open row. */
export async function POST(request: Request, ctx: RouteContext<"/api/virtual/attendance/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const fn = body.action === "leave" ? "virtual_leave" : "virtual_heartbeat";
  const { data, error } = await (sb as unknown as SupabaseClient).rpc(fn, { p_attendance: id });
  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
