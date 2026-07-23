import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/", "/login", "/operator/login", "/customer/login", "/auth/resolve", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/accept-invite", "/pricing", "/features", "/security", "/contact", "/book-demo", "/product", "/onboarding", "/_next", "/api",
  // Public token-based routes (proposal sign, form fill, client/supplier/venue portals, guest QR check-in)
  "/p", "/f", "/portal", "/rfq", "/supplier-portal", "/venue-portal", "/check-in",
  // Public event pages + discovery directory (EB-L / 15-9 / V2-8)
  "/e", "/discover",
  // Consumer "build my event" flow — guest-usable, account optional until checkout (/account itself
  // is NOT public: it requires login, same as any other protected route below).
  "/build",
  // Isolated platform-admin sign-in — exact match only, everything else under /admin/* stays gated
  // (both here and again server-side via requirePlatformAdmin(), which also checks is_platform_admin()).
  "/admin/login"];

// Exact-match-only public paths — unlike PUBLIC_PREFIXES, these do NOT implicitly make their
// children public. /affiliate is a prefix of /affiliate/dashboard, which must stay gated, so it
// cannot go in PUBLIC_PREFIXES.
const EXACT_PUBLIC_PATHS = ["/affiliate", "/affiliate/login", "/affiliate/apply"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    EXACT_PUBLIC_PATHS.includes(pathname) ||
    pathname.includes(".");

  // Development-only Gala Dock shell fixtures. The bypass is impossible in production even if
  // the environment value is accidentally set, and it only applies to the new typed namespaces.
  const isDevelopmentShell =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_GALA_SHELL_DEMO === "true" &&
    ["/organizer", "/venue", "/supplier"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!user && !isPublic && !isDevelopmentShell) {
    const url = request.nextUrl.clone();
    // Three fully isolated sign-ins — workspace, platform admin, affiliate — each unauthenticated
    // visitor lands on the matching one, never a different persona's login.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      url.pathname = "/admin/login";
      url.search = "";
    } else if (pathname === "/affiliate/dashboard" || pathname.startsWith("/affiliate/dashboard/")) {
      url.pathname = "/affiliate/login";
      url.search = "";
    } else {
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
    }
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup" || pathname === "/operator/login" || pathname === "/customer/login")) {
    const next = request.nextUrl.searchParams.get("next");
    const url = request.nextUrl.clone();
    url.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next : "/auth/resolve";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
