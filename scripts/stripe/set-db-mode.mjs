// Records the platform Stripe mode in public.stripe_platform_mode (migration 202610295001) — the same write the production server
// makes on boot (src/instrumentation.ts). Use only if the production boot write did not happen. The mode is DERIVED from the key in the
// environment you pass (never a CLI argument), so the key stays the single source of truth. No Stripe API call. Prints no secrets.
// Dry run unless --apply:
//   NODE_ENV=production node --env-file=.env.production.local scripts/stripe/set-db-mode.mjs [--apply]
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const key = env.STRIPE_CONNECT_SECRET_KEY || (env.NODE_ENV !== "production" ? env.STRIPE_SECRET_KEY_SANDBOX : undefined);
const mode = !key ? "unconfigured" : /^(sk|rk)_live_/.test(key) ? "live" : /^(sk|rk)_test_/.test(key) ? "test" : "unconfigured";
if (mode === "unconfigured") { console.error("No sk_/rk_ platform key in this environment."); process.exit(1); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: rec, error } = await db.from("stripe_platform_mode").select("livemode,source,updated_at").maybeSingle();
if (error) { console.error(error.message); process.exit(1); }
console.log(`key mode = ${mode}; database record = ${rec ? (rec.livemode ? "live" : "test") : "absent"}${rec ? ` (${rec.source}, ${rec.updated_at})` : ""}`);
if (!process.argv.includes("--apply")) { console.log("Dry run: pass --apply to record this mode (re-mirrors workspaces.payout_status when it changes)."); process.exit(0); }
const r = await db.rpc("stripe_set_platform_mode", { p_livemode: mode === "live", p_source: "set-db-mode-script" });
if (r.error) { console.error(r.error.message); process.exit(1); }
console.log(JSON.stringify(r.data));
