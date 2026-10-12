import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";
import { syncUser } from "@/lib/calendar-sync/sync";

export const maxDuration = 60;

/** "Sync now" for the signed-in user's connected calendars. */
export async function POST() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateLimit(`calsync:${user.id}`, 6, 600))) return NextResponse.json({ error: "Synced recently. Try again in a few minutes." }, { status: 429 });
  const r = await syncUser(user.id);
  return NextResponse.json({ ok: r.every(x => x.ok), results: r.map(x => ({ ok: x.ok })) }, { headers: { "Cache-Control": "no-store" } });
}
