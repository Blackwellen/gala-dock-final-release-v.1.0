# W12 part A — responsive, zoom, orientation (provider, affiliate, portals, admin)
Run 2026-10-29 · lane A · `a5-lane/w12.mjs`. Read-only: it never clicks. One browser; it signs in again when another lane's login revokes the session, and resumes after a dev-server outage.

Configurations: 1920×1080, 1536×864, 1448×1086, 1280×800, 1024×768, 768×1024, 390×844 (mobile, touch), 844×390, 1180×820, plus zoom 80/125/150/200% at 1536 (emulated as Chrome zoom: CSS viewport = size ÷ zoom, pixel ratio = zoom; 100% is the 1536 row).

Checks per cell: horizontal overflow; controls off-screen or text clipped; tap targets under 24 px (phone); sticky header after scrolling; right rail inside the viewport; focus ring visible and on-screen (8 Tab presses at 1536, 390 and 200%); page errors; elements with a CSS zoom; component sizes at 1536 (buttons, inputs, h1, h2, chips).

## Cells
| Surface | Identity | Routes × configs | Cells |
|---|---|---|---|
| Provider (venue) | provider.demo | 33 × 13 | 429 |
| Provider (solo) | solo.supplier.demo | 8 × 13 | 104 |
| Provider (agency) | agency.demo | 6 × 13 | 78 |
| Partner / promoter | partner.demo / promoter.demo | 1 / 2 × 13 | 39 |
| Portals (portal, approvals, messages, guest, proposal, contract, pay, invite, /r consent, admin login) | fixture tokens | 10 × 13 | 130 |
| Admin (28 list pages + 5 detail) | admin.demo, TOTP | 33 × 13 | 429 |
| **Total** | | | **1,209** |

## Findings
- **1920 / 1536 / 1448 / 1280 / 1024 / 768 / 1180, zoom 80 / 125 / 150%:** 0 overflow, 0 off-screen controls, sticky headers hold, right rails inside the viewport, 0 elements with CSS zoom. Exception: `/admin/trust` case-subject link clipped 28–43 px (open).
- **390×844 portrait:**
  - `/provider/money/statement` overflowed by 71 px and pushed the tab bar's Menu off-screen — **fixed** (`provider-money.css:131-134`), 0 px.
  - Tap targets under 24 px fixed: calendar layer chips (30 px), home insight CTAs (24 px), portal `.pt-link` (24 px), promoter `.pp-manage`, admin `.aa-link/.adb-link/.adb-dots/.adb-copy/.aa-switch` (`admin-pwa.css:73-79`).
  - Portal closed side menu reachable by Tab while off-screen — **fixed**.
  - "Back" focus reported off-screen: smooth-scroll measurement artefact (verified on screen at top 8 px).
  - Remaining under 24 px: standalone text links in lists/tables (booking and listing names at 14–15 px, shared `.ws-link` "Open in maps", "View breakdown") — mostly under WCAG 2.5.8's spacing exception; `.ws-link` left for the design pass.
- **844×390 landscape:** same tap-target set as portrait, 0 overflow, tab bar and sheet usable.
- **200% at 1536:** 0 overflow; reflows to the phone layout.
- **Focus ring:** portal, partner and promoter inputs had none — **fixed** (`portal-shell.css`).
- **Page errors:** `/provider/packages/[id]` once at 1448 (Suspense boundary) and `/provider/agent/policy` once at 1024 (HMR chunk) — not reproduced in 12 other configs; dev-server noise.
- Cookie banner on phone covers the bottom tab bar until a choice is made (noted).

## Component scale (owner standard: one display scale, no per-component zoom)
- No CSS zoom on provider, affiliate, portal or admin pages beyond `density.css:23-25`; 0 zoomed elements in 1,209 cells.
- **Open for the consistency pass:** `src/app/globals.css` has 17 zoom rules — 449 and 451 (auth/onboarding fit) and 964, 1067, 1073, 1081, 1088, 1101, 1106, 1113, 1118, 1130, 1142, 1147, 1153, 1162, 1167 (`zoom: .95–1.03` on auth/onboarding form and assistant panels).
- **Fixed (follow-up):** admin titles are one size (30 px lists, 24 px details; root cause: the `--k-*` tokens were only defined in `kit.css`, which admin/provider/portal don't load — now also defined in `density.css:28-38`). Admin row menu/copy buttons use the 26 px dense token. Provider outliers (inbox, Media Studio, statement) now match the provider page title, 34 px, as the provider references were matched (coordinator call; organiser/customer stay 28 px, admin lists 30 px). `globals.css` panel zoom rules already removed; the page-fit at lines 449/451 is kept as the single auth/onboarding display scale.
- **Re-check:** 54 cells at 1536 and 390 (provider, admin, auth, onboarding, agency staff): 0 overflow, 0 clipped, 0 errors, 0 zoom.

## Re-verified after fixes
Statement overflow 0; calendar chips 30 px; insight CTAs 24 px; portal links 24 px; portal side menu hidden when closed (0 off-screen focus stops); mobile sheet one Help and one My account; BEO event-order id lands on the BEO; package page 0 duplicate-key errors; Add requirement disabled when empty; admin event links 200. The full matrix was not repeated (CSS-only fixes checked cell by cell).
