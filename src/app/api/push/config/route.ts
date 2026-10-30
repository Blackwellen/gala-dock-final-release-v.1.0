import { NextResponse } from "next/server";
import { pushConfig } from "@/lib/pwa/push";

/** Q37: the VAPID public key the browser subscribes with (public by design). 503 while push is BLOCKED_EXTERNAL. */
export async function GET() {
  const cfg = pushConfig();
  return cfg.configured
    ? NextResponse.json({ publicKey: cfg.publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } })
    : NextResponse.json({ status: cfg.status, error: "push_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
