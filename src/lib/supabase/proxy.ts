import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "./config";
import { REMEMBER_COOKIE, sessionCookieOptions } from "./session-cookies";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseConfig();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, sessionCookieOptions(options, request.cookies.get(REMEMBER_COOKIE)?.value));
        });
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");
      },
    },
  });

  // Validate and refresh the session before Server Components read its cookies.
  await supabase.auth.getClaims();
  return response;
}
