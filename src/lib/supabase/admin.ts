import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "./config";
import { DB_MODE_HEADER, platformMode } from "@/lib/payments/stripe-mode";

// Use only in trusted server code after checking the caller's permissions.
export function createAdminClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. Configure .env.local.");
  }

  // Stripe go-live (lane A2): every service-role request tells the database which Stripe mode this server runs in, derived from
  // the platform key's prefix. public.stripe_livemode() honours it for service_role only, so DB readiness/checkout functions and
  // new money rows follow the key this request will actually use. Unconfigured → no header (database default applies).
  const mode = platformMode(process.env);
  return createClient<Database>(url, serviceRoleKey, {
    ...(mode === "unconfigured" ? {} : { global: { headers: { [DB_MODE_HEADER]: mode } } }),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
