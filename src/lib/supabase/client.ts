"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "./config";
import { REMEMBER_COOKIE, sessionCookieOptions } from "./session-cookies";

function readCookies() {
  return document.cookie.split(";").filter(Boolean).map(part => {
    const index = part.indexOf("=");
    return { name: decodeURIComponent(part.slice(0, index).trim()), value: decodeURIComponent(part.slice(index + 1).trim()) };
  });
}

export function createClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey, {
    cookies: {
      getAll: readCookies,
      setAll(cookies) {
        const remember = readCookies().find(c => c.name === REMEMBER_COOKIE)?.value;
        for (const { name, value, options } of cookies) {
          const o = sessionCookieOptions(options, remember);
          let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=${o.path ?? "/"}; SameSite=${o.sameSite === "strict" ? "Strict" : o.sameSite === "none" ? "None" : "Lax"}`;
          if (o.maxAge !== undefined) cookie += `; Max-Age=${o.maxAge}`;
          if (o.domain) cookie += `; Domain=${o.domain}`;
          if (location.protocol === "https:") cookie += "; Secure";
          document.cookie = cookie;
        }
      },
    },
  });
}

/** Stores the "remember this device" choice before a session is created. */
export function setRememberDevice(remember: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REMEMBER_COOKIE}=${remember ? "1" : "0"}; Path=/; SameSite=Lax; Max-Age=${400 * 86400}${secure}`;
}
