import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncDue } from "@/lib/calendar-sync/sync";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/** Two-way calendar sync worker. Called hourly by pg_cron (calendar-sync) with the CRON_SECRET bearer; least-recently-synced first. */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json(await syncDue(), { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
