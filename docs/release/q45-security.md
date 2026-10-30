# Q45 security evidence (lane C, 2026-10-29) — evidence phase; verdict waits for close-out

Every probe ran against the live shared project; every probe that could write ran inside a transaction that was always rolled back.

## 1. SECURITY DEFINER authorisation sweep — PASS (after S02)
1,232 public definer functions: 148 trigger, 400 service-only, 649 authenticated-only, 35 anon; all have a pinned search_path. `tests/release/q45-authz-sweep.spec.ts` called every one of the **684** authenticated-callable non-trigger definer functions as a new signed-in outsider (real JWT claims, arguments resolved to other tenants' real rows, owner controls, rolled back): 502 refused, 5 uniform 404, 39 input rejected before auth (owner rejected the same way), 103 empty, 28 returned data (each reviewed: public catalogue, own rows or refusal-as-data), 7 wrote own rows only, **0 unreviewed**. P3 (S04): `catering_price` / `venue_quote` price draft menus/spaces by id (numbers only). Evidence `artifacts/security/q45-authz-sweep.json`.

## 2. RLS — PASS
All 428 public tables have RLS on. Outsider and anon probes on every table: **0 updatable or deletable**; readable 65 (outsider) / 37 (anon), all reviewed public/catalogue or own rows; leak check on hidden subsets (private events, unpublished listings, non-public tiers/seats, drafts, other profiles): 0 rows. Evidence `artifacts/security/q45-authz-sweep-rls.json`. tenant-security 12/12.

## 3. Defects found and fixed
- **Q45-S01 P1 stored XSS — FIXED (202610293033).** Studio icon layers and venue-plan glyphs render SVG via innerHTML; barcode colours go into SVG attributes. The old template scrub was bypassed 4/5 (`<image/onerror=…>`, tab/newline-separated handlers, entity-encoded `javascript:`). Fix: decoded-string checker + BEFORE triggers on designs, design_versions, design_templates, design_elements, venue_maps.overlay, venue_structures.elements. 0 existing rows offended; 5/5 probes refused after (`q45-input-safety`). Remaining P2: client-side sanitising in `components/media/layer-view.tsx`, `components/venue-plan/design-el-view.tsx`.
- **Q45-S02 P1 admin MFA bypass — FIXED (202610293034).** On a password-only (aal1) session 57 of 138 admin-gated RPCs answered, 34 with data (`admin_user_identity` email/phone/sessions, `admin_overview`, user stats, ops overview). Fix: `has_admin_permission` and `is_platform_admin` require aal2; `admin_require` keeps step_up_required. Rollback references 202610130001, 202610292001. **Effect: platform admins must have MFA enrolled to use admin.**
- **Performance (202610293035):** tickets(order_ref) 67 ms → 0.05 ms; tickets(lower(attendee_email)); check_ins(event_id, created_at).

## 4. Headers and CSP — PASS with H-01/H-02 open
HSTS 2y preload; nosniff; frame-ancestors none (self on /events preview); base-uri, form-action, object-src set; Referrer-Policy strict-origin-when-cross-origin (no-referrer on token/door pages); no-store on API/auth/token; noindex on token pages; Permissions-Policy camera self, microphone none, geolocation self, payment self. Added in Q45 (`src/proxy.ts`): COOP same-origin-allow-popups, X-Permitted-Cross-Domain-Policies none, Origin-Agent-Cluster. Full CSP staged Report-Only behind `CSP_REPORT_ONLY=1` with receiver `/api/csp-report`.
- H-02 (P2): enforced CSP lacks script-src/default-src — needs nonces.
- H-01 (P3): extend Permissions-Policy (usb, serial, hid, midi, display-capture, browsing-topics); `payment=(self)` blocks Payment Request inside js.stripe.com.
- Cookies: `gd_admin_seen`, `gd_consent`, partner cookie HttpOnly + SameSite + Secure on https; Supabase session cookies JS-readable by design (@supabase/ssr). Admin idle timeout 30 min.

## 5. Secrets — PASS
`.env*` ignored; history only added `.env.example`; tracked files + 145 commits scanned: only synthetic redaction fixtures. Served client JS (36 chunks, 12 pages) checked for 45 secret values/names: 0 hits. NEXT_PUBLIC_* = Supabase URL + anon key, Turnstile site key only.

## 6. Rate limits — PASS (captcha OFF = owner close-out)
Auth (Supabase limits), checkout 12 / 5 min, codes 10 / 10 min, public search/discover 120/min, marketplace 60/min, autocomplete 240/min, token pages per-IP, pay 10 / 10 min per token, API v1/MCP per key, analytics capture 120/600 per min, webhooks signature + idempotency. P3: SSR public pages rely on Vercel/CDN; map tile proxy only browser hot-link guarded. `clientIp` trusts first x-forwarded-for (correct on Vercel).

## 7. Input safety
Open redirects PASS (10 `safeNext` attacks, `/continue`, boost clicks, `/r/*`, `/auth/callback`, `/auth/confirm`). XSS sites: JSON-LD escaped; QR/barcode self-generated; design/venue SVG now DB-guarded (S01); no markdown renderer. SSRF PASS (`assertPublicUrl`, re-checked per attempt, no redirects). Uploads per Q04; malware scan BLOCKED_EXTERNAL (ClamAV).

## 8. Auth
Session revocation PASS; admin MFA PASS after S02; step-up PASS. OWNER: Supabase Auth `password_min_length` 6 (raise to ≥8 + character classes — the app rule is client-side only); enable HIBP leaked-password check; consider `security_update_password_require_reauthentication`.

## 9. Dependencies
npm audit 0 (after next 16.4.3 / zod 4.6.7). Licences: MIT/ISC/Apache/BSD; LGPL-3.0 libvips (sharp, dynamic), MPL-2.0 axe-core (dev), OFL Inter. Unused `@anthropic-ai/sdk` removed by the coordinator (owner rule: AI is Azure-only).

## Open for the final verdict
Owner: captcha T1/T2, password policy + HIBP, Stripe onboarding, ClamAV. Engineering: H-02 nonce CSP, H-01 Permissions-Policy, S01 client sanitising, `calendar_window` timezone cost. Run `w08-admin-tiers`, `q31-support-ops`, `test-fixture-purge` (not run in this phase). Design lanes: browser/responsive/WCAG/PWA matrices.
Incident: a syntax error in `/api/csp-report` returned 500 on every dev route for ~5 min (14:36–14:42); fixed.

## Close-out engineering (lane C, 2026-10-29)
- **S01 client layer — FIXED.** `src/lib/security/svg-sanitize.ts`: allow-list rebuild sanitiser (no dependency) applied before every innerHTML render of stored/generated SVG — Studio icon layers + barcode/QR (`media/layer-view.tsx`), venue-plan glyphs (`venue-plan/design-el-view.tsx`), icon picker; barcode colour validated in `lib/tickets/code128.ts`. q45-input-safety payloads + 37 SVG XSS vectors inert; 54,082 shipped icons unchanged (`q45-svg-sanitize` 5/5). Also fixed: badge-print popup wrote the stored template accent raw into `<style>` (break-out to a same-origin window) — now colour-validated; inline print script replaced by an opener listener.
- **H-01 — FIXED.** Permissions-Policy adds usb, serial, hid, midi, display-capture, browsing-topics = (); `payment=(self "https://js.stripe.com")` (`src/proxy.ts`, `src/lib/security/csp.ts`).
- **H-02 — IMPLEMENTED, Report-Only.** Per-request nonce CSP from the proxy (Next guide pattern); root layout reads the nonce for the display-scale fit script; 100% of executable scripts nonced on /, /login, /events/[slug], /checkout/[event]. script-src 'self' 'nonce' 'strict-dynamic' (+ Stripe/Turnstile CSP2 fallback; 'unsafe-eval' dev only); style-src keeps 'unsafe-inline' without a nonce (React style attributes are pervasive); img/connect/frame/worker/default-src scoped; report-uri + report-to → /api/csp-report. Modes: default Report-Only; `CSP_ENFORCE=1` enforces; `CSP_REPORT_ONLY=0` off. `q45-csp` 6/6. Close-out: clean Report-Only run, check the maintenance page under enforcement, then `CSP_ENFORCE=1`. All pages now render dynamically (required for nonces).
- **Waitlist offers vs seller readiness — FIXED (202610293036).** notify_waitlists skips events whose seller isn't payment-ready while any tier is paid; exercise proved the old body offered a not-ready paid waiter. `waitlist-seller-readiness` 3/3, Q22 6/6.
- Re-runs: q45-input-safety 4/4, q45-authz-sweep 4/4 (684 functions, 0 unreviewed), tenant-security 12/12.
