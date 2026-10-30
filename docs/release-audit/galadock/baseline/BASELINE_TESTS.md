# Q00 baseline tests — 2026-10-28

Logs: session scratchpad `q00-baseline/t-*.txt`. Dev server on :3107 under `tools/dev/dev-watchdog.mjs`. One worker, disposable test identities only.

| Check | Command | Result |
|---|---|---|
| TypeScript | `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit -p .` | 0 errors, exit 0 (11 s, incremental) |
| ESLint | `npx eslint .` | 928 files, 0 errors, 395 warnings: `@next/next/no-img-element` 174, unused eslint-disable 165, `no-unused-vars` 40, `no-unused-expressions` 12, `react-hooks/exhaustive-deps` 3, `jsx-a11y/role-supports-aria-props` 1 |
| Playwright `tests/foundation` (2 files) | `node --env-file=.env --env-file=.env.local node_modules/@playwright/test/cli.js test <files> --project=desktop --reporter=line` | 10/10 pass, 18 s |
| 20 non-browser `tests/release` files | same | 63/64, 1.4 min |
| 6 marketplace API files (agent, marketplace, messaging, operations, search, venue-fnb) | same | 25/25, 36 s |
| Money specs (`marketplace/payments`, `release/event-cancellation`, `release/ticket-refund-confirmation`) | same | 23/23, 50 s |

**Total: 121 run, 120 passed, 1 failed.**

The 20 release files: agent-credits, agent-planning-tools, agent-run-types, boost-delivery, boosts, calendar-sync, demo, developer, email, google-signin, launch, marketplace-availability, privacy, production-readiness, resale-original-refunds, saved-payment-methods, storage-quota, team-conflicts-v2, ticket-ledger, vat.

## Failures

- `tests/release/agent-run-types.spec.ts:53` "event-driven routines wake on matching domain events…": `expect(received).toBeLessThanOrEqual(expected)`; `next_run_at` about 1.1 s ahead of local `Date.now()+1000`.
- On rerun, `:33` "a watch only uses read-only tools…" also failed: `expect(w.checks).toBe(1)`, received 0.
- Both indicate the local clock running behind the database clock, not a product logic bug (Q03: make the tests use DB time).

## Not run yet

68 spec files in total: e2e/customer 7, e2e/organizer 8, foundation 2, marketplace 11, phase1 4, release 36. Not run: e2e/customer, e2e/organizer, phase1 (a11y, journeys, responsive, rls) and the browser-based release/marketplace specs (media, ticketing, pwa-*, mfa, sessions, tours and others) — held back for resource limits; scheduled under Q39/Q44 and lane W.

## Not audited

Authorisation inside the 406 SECURITY DEFINER functions and table GRANTs (information_schema grants were not visible to the management role) — Q01.
