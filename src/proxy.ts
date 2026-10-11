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
  // Platform Admin idle timeout (release spec §6): 30 minutes without an admin request ends the admin session on this device.
  const path = request.nextUrl.pathname;
  if (path.startsWith("/admin")) {
    if (path.startsWith("/admin/login")) { const res = await updateSession(request); res.cookies.delete(ADMIN_SEEN); return res; }
    const last = Number(request.cookies.get(ADMIN_SEEN)?.value ?? 0);
    if (last && Date.now() - last > ADMIN_IDLE_MS) {
      const res = NextResponse.redirect(new URL("/admin/login?reason=idle", request.url), 303);
      for (const c of request.cookies.getAll()) if (c.name.startsWith("sb-")) res.cookies.delete(c.name);
      res.cookies.delete(ADMIN_SEEN);
      return res;
    }
    const res = await updateSession(request);
    res.cookies.set(ADMIN_SEEN, String(Date.now()), { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: 8 * 3600 });
    return res;
  }
  return updateSession(request);
}
const ADMIN_SEEN = "gd_admin_seen", ADMIN_IDLE_MS = 30 * 60_000;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
