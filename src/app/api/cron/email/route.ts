import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { drainOutbox } from "@/lib/email/send";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/** Email outbox worker (release spec §77). Called by pg_cron every 2 minutes with the CRON_SECRET bearer. */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json(await drainOutbox(), { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
