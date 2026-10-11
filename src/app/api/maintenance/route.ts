import { NextResponse } from "next/server";
import { maintenanceState } from "@/lib/maintenance";

/** Public banner feed: active maintenance windows (banner-safe fields only). Reachable at every level. */
export async function GET() {
  const ws = await maintenanceState();
  return NextResponse.json({ windows: ws.map(w => ({ id: w.id, level: w.level, modules: w.modules, title: w.title, message: w.message, status_url: w.status_url, expected_restore: w.expected_restore, audience: w.audience, dismissible: w.dismissible, severity: w.severity, reference: w.reference })) }, { headers: { "Cache-Control": "public, max-age=10, s-maxage=10" } });
}
