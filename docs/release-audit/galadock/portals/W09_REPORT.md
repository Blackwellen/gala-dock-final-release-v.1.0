# W09 External portals (2026-10-29, lane B)

Disposable fixtures (portal links valid/expired/revoked on 2 orgs, disposable organizer event with approvals/doc, guest links), all removed. Evidence `artifacts/visual/w09/` (`w09-results.json`). Proposal/contract/invoice opened read-only.

| Portal | Token / expiry / revocation | Scope | Result |
|---|---|---|---|
| `/portal/[token]` (PORT-001) | 256-bit, SHA-256 hashed; expiry + revocation in `portal_link_for` | per token (A/B only own event; doc via wrong token 404) | PASS — approve/reject/message/download verified in DB; per-link 600/h + per-IP 300/h |
| `/guest/[token]` (Q14) | hashed; expiry/revocation | own event | PASS — check venue hidden when `show_location=false` (Q14) |
| `/proposal/[token]` (Q16) | 36-hex plaintext; `valid_until` | one proposal | PASS — no h1 (shared preview) |
| `/contract/[token]` (Q16) | 48-hex plaintext, service-only fn | one contract | PASS — unsigned signing view not captured (seed) |
| `/pay/[token]` (Q07) | function requires 36 chars | — | **FAIL — every live invoice link 404s (tokens are 24 hex)** |
| `/tickets/accept/[token]` | hashed; expiry + recipient | — | PASS — signed-out now → `/login?next=…` (was /discover) |
| `/invite/[token]` | hashed | — | PASS |

Bad/expired/revoked tokens: identical 404, now a branded `LinkUnavailable` page. Headers on token paths: `private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`; 0 token Referer leaks. Census 25 pages: 0 dead/unnamed controls, 0 overflow, 390 px OK, 0 console errors.

Fixes: `next.config.ts` token headers; `not-found.tsx` + `src/components/portal/link-unavailable.tsx`; `tokenPageAllowed()` per-IP limits (`src/lib/security.ts`); metadata on proposal/contract/pay/ticket-accept; `src/styles/portal-client.css` empty states.

Open: Q07 P1 pay links; Q16 plaintext share tokens + viewing marks "viewed" (link-preview bots); Q14 show_location; seed gaps (Neon Nights invoices/video, unsigned contract, demo guest links); staff my-shifts not captured.
