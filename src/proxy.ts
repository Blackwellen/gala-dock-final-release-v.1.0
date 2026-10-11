import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { decide, maintenanceState } from "@/lib/maintenance";

export async function proxy(request: NextRequest) {
  // Maintenance levels (release spec §9): refuse writes / show the maintenance page before any session work.
  const d = decide(await maintenanceState(), request.nextUrl.pathname, request.method);
  if (d.action !== "allow") {
    const headers = { "Cache-Control": "no-store", "Retry-After": "300", "X-Maintenance-Level": `M${d.window.level}` };
    const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (write || request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: d.window.message || d.window.title, maintenance: { level: d.window.level, module: d.action === "deny" ? d.module : null, status_url: d.window.status_url, reference: d.window.reference } }, { status: 503, headers });
    }
    const url = request.nextUrl.clone(); url.pathname = "/maintenance"; url.search = `?w=${d.window.id}`;
    return NextResponse.rewrite(url, { status: 503, headers });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
