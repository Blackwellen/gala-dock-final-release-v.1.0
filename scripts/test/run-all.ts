/**
 * Gala Dock — security / billing test harness (F4).
 *
 * Mirrors Propvora's consolidated harness. These suites exercise the LIVE database with a
 * service-role client, so they REQUIRE credentials and are NOT run by the unit `npm test`.
 *
 * Required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
 * Run with:  npm run test:security
 *
 * Suites (to be implemented as each feature lands — see docs/specs/README.md F4):
 *   1. RLS multi-workspace isolation + IDOR sweep
 *   2. Subscription / feature-gate boundaries (per-tier allow/deny, 402 messages)
 *   3. Stripe webhook coverage (signature, idempotency, lifecycle)
 *   4. Entitlement gates E2E (every tier boundary)
 *   5. RLS coverage (every workspace_id table has RLS enabled)
 *   6. Anonymous exposure (anon client leaks no rows)
 *   7. Role-within-workspace RBAC
 *   8. Portal token scoping (supplier / client / invoice / venue)
 *
 * This file is intentionally a guarded scaffold: it fails CLOSED with a clear message when
 * credentials are absent, rather than pretending the suites passed.
 */

type Suite = { name: string; run: () => Promise<void> };

function requireEnv(): { url: string; serviceKey: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

// Suites are registered here as they are implemented per spec. Empty for now —
// each V1 feature spec adds its RLS/gate suite (see F4 acceptance criteria).
const SUITES: Suite[] = [];

async function main() {
  const creds = requireEnv();
  if (!creds) {
    console.error(
      "\n[test:security] SKIPPED — missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "These suites run against the live database and require the service-role key.\n" +
        "Set them in the environment (never commit them) and re-run.\n"
    );
    // Exit non-zero so CI treats an unconfigured security run as a failure, not a pass.
    process.exit(2);
  }

  if (SUITES.length === 0) {
    console.log(
      "[test:security] credentials present, but no suites are registered yet.\n" +
        "Suites are added per feature spec (F4). See docs/specs/README.md."
    );
    return;
  }

  let failed = 0;
  for (const suite of SUITES) {
    try {
      await suite.run();
      console.log(`  PASS  ${suite.name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${suite.name}:`, err instanceof Error ? err.message : err);
    }
  }
  if (failed > 0) {
    console.error(`\n[test:security] ${failed}/${SUITES.length} suite(s) failed.`);
    process.exit(1);
  }
  console.log(`\n[test:security] all ${SUITES.length} suite(s) passed.`);
}

void main();
