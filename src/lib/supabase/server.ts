import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "./config";
import { REMEMBER_COOKIE, sessionCookieOptions } from "./session-cookies";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, sessionCookieOptions(options, cookieStore.get(REMEMBER_COOKIE)?.value));
          });
        } catch {
          // Server Components cannot set cookies; proxy refreshes the session.
        }
      },
    },
  });
}
