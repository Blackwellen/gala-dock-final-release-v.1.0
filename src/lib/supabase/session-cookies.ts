import type { CookieOptions } from "@supabase/ssr";

/** Set to "0" at sign-in when the user does not want this device remembered. */
export const REMEMBER_COOKIE = "gd-remember";

/** Without "remember this device", auth cookies become browser-session cookies. */
export function sessionCookieOptions(options: CookieOptions, remember: string | undefined): CookieOptions {
  if (remember !== "0" || !options.maxAge) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
