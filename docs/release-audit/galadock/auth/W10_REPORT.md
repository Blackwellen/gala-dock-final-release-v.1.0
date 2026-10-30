# W10 Auth, onboarding, subscriptions, switching (2026-10-29, lane B)

Disposable identities only (8 users, removed); captcha off (T1/T2 — restore before sign-off). Evidence `artifacts/visual/w10/`.

- AUTH-001…008 (1448×1086 + phone) render and match after fixes: card logo restored (`src/styles/brand.css`), invite heading overlap (`globals.css`).
- Return paths kept for every signed-out deep link: `src/proxy.ts` sets `x-gd-return-path` (overwrites client value), `requireUser` prefers it (`src/lib/auth.ts`, `src/lib/redirects.ts`). Checkout banner matches `/checkout/[event]`.
- Unconfirmed sign-in → `/verify-email`. TOTP challenge → destination. Passkeys/recovery left to `mfa`/`passkeys` specs.
- Onboarding ONB-001, CU-01, ORG-01, PROV-01 match; step guard holds; nothing submitted.
- Invites: UI invite → accept → member; UI revoke (Q01 commands `create_workspace_invite` / `revoke_workspace_invite`, migration 202610292008, spec `tests/release/workspace-invites.spec.ts` 5/5).
- Billing: organizer "Choose monthly" → Stripe Checkout test session (not paid); provider billing 272 px overflow fixed; provider plans "Contact us to switch" (no self-serve — Q28).
- X17 switching organizer → provider → customer and back: no name/event/listing bleed; `last_workspace_id` correct.

Tests: workspace-invites 5/5, MFA-fixed specs 23/23 (marketplace 6, event-cancellation 6, trust 11), tenant-security 12/12; tsc 0; eslint 0 errors.

Open: Q28 provider self-serve plans; Q01 revoke legacy `workspace_invites` column grants after deploy.

## Re-check (2026-10-29, lane B) — focus, off-screen focus, sticky header, tap targets
Method: Tab through every focusable on /login, /register, /forgot-password, /access, /admin/login and onboarding step 1 (organiser, provider) at 1536, 390 and 360, smooth scrolling off. Per stop: visible ring, in viewport after focus, tap target ≥24px (WCAG 2.5.8; links inside a sentence exempt). Disposable `p1-` users, deleted; no captcha.
- **Focus rings — fixed.** `/admin/login` inputs had only a faint 3px halo; now the kit ring (2px #1b64f5 outline + halo), links/buttons get a focus-visible outline (`admin-login.css`). Onboarding header search, header links and "Popular organizer types" buttons get the same ring (`globals.css`). 0 stops without a ring.
- **Off-screen on focus — not reproduced** with smooth scrolling off (lane A reports were smooth-scroll artefacts).
- **Onboarding header — now sticky** (`position: sticky; top: 0`), matching the story panel that already assumes a 64px pinned header; verified at 1536/390/360.
- **Tap targets — fixed.** Auth footer, Help / Contact, "Forgot password?", "Learn more", back links, remember-me info icon, admin "Show password", onboarding nav/search/"Save & exit" now ≥24px; on the scaled auth/onboarding pages minimums are `24px / scale` so they render ≥24px at 1536. 0 targets under 24px. Logo sizes (46 / 38 ≤700) unchanged.
- **Open (pre-existing, not caused by these fixes):** axe colour contrast on preview auth/onboarding pages (`.counter`, selected-choice labels, `.auth-note small`, `.setup-disclaimer`, `.badge.muted`, `.soft`, `u`); `a11y.spec` keyboard test assumes Email → Password but "Forgot password?" sits between them (spec needs updating); `journeys.spec` C (onboarding unavailable message) and K (MFA) behavioural failures to triage.
- tsc 0. Specs: 23 passed, 16 failed (the open items above).

### Addendum (2026-10-29, lane B): auth/onboarding regression green
- **Colour contrast (13 axe failures) — fixed in the product.** Text on pale blue tints (selected choices and chips, soft buttons, "Skip business setup") was #1664fe at 4.2–4.46:1; now `--gd-blue-ink` #0049d9 (~6.6:1). Helper greys (counters 3.0:1, setup disclaimer 3.7:1, auth note 4.42:1, reset-password rules 3.6:1, small text under selected choices 4.3:1, "Recommended" badge 3.93:1) darkened within their families (`--gd-muted-ink` #5d6585 and darker ink shades). Register checkboxes keep the 21px box with a 24px target. Axe: 0 serious/critical on all 18 preview screens.
- **Keyboard test — spec updated** to the design's tab order (AUTH-001: "Forgot password?" on the Password label row): Email → Forgot password? → Password → Show password.
- **Journey C — stale spec** (asserted a Gala Agent "unavailable" message; agent is live and tests must not call AI) — now checks the helper button is present and continues setup.
- **Journey K — stale spec** (recovery-code placeholder replaced by the real recovery-code form) — now expects that form; the MFA challenge itself passes.
- Result: phase1 a11y + journeys + mfa + google-signin **39/39**. eslint 0.
