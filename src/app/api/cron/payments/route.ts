import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processPayments } from "@/lib/commerce/orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/** Payment worker (§38/§43): release scan, provider transfers, cancellation refunds. Called by pg_cron via pg_net with the CRON_SECRET bearer. */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  // Security lockdown / full maintenance on payments halts outbound money movement (release spec §9 M4–M5); webhooks still record state.
  const { data: lvl } = await createAdminClient().rpc("maintenance_level" as never, { p_module: "payments" } as never);
  if (Number(lvl ?? 0) >= 4) return NextResponse.json({ paused: `maintenance M${lvl}` }, { headers: { "Cache-Control": "no-store" } });
  const result = await processPayments();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
