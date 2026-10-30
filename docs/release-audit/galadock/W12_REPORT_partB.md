# W12 part B: Responsive, zoom and orientation matrix (customer + public)

**Run:** 2026-10-29 · Agent B (Opus) · dev :3107 · one headless Chrome at a time · tool `b5/tools/w12.mjs` · evidence `b5/cap/w12-{public,customer}{,-r}/`, merged JSON. Cells hit by the `/api/csp-report` 500 window or a dev-server drop were re-run.

Matrix: 1920×1080, 1536×864, 1448×1086, 1280×800, 1024×768, 768×1024, 390×844 (DPR 3, touch), 844×390 (DPR 3, touch), 1180×820 (DPR 2, touch); zoom 80/100/125/150/200% at 1536. Public 31 routes, customer 28 routes = 826 loads. Checked: status, horizontal overflow, clipped controls, tap targets < 24 px (WCAG 2.5.8; inline links exempt), sticky header after scroll, visible focus, console errors.

## Results
- Non-200 (excluding expected 404s): 0 everywhere. Sticky header: 0 failures.
- Public overflow: only `/forgot-password` (11 px at 1024, 768, 150%, 200%). Public focus: tool flags border-colour focus on auth pages (visual check pending).
- Customer overflow: 0 at every size and zoom. Clipped controls 2–3 per size (map pin outside map — expected; "View details" hit area 4 px; one tickets "More options" at 390). Tap targets < 24 px: 1–10 per size (mostly plan/guests checkboxes still 18 px pending re-measure; account summary links at 125%).

## Fixed
Build page header row clipping the Package actions menu (wraps now); tap targets (task circles 24, day arrows, More photos, ticket arrows, `.k-link`, review stars, checkbox rule); consistency pass — zoom hacks removed (cu-book .92/.88, cu-events .96, cu-reviews .95, ticket-setup .9), customer sizes mapped to `--k-*` tokens, landing zoom removed.

## Open findings (re-measured 2026-10-29)
1. Fixed: `/forgot-password` 11px overflow — now 0 at 1024, 768, 150% and 200%. Auth focus ring visible on login, register, forgot-password and access at all six measured sizes.
2. Fixed: `/access` overflowed at 768 and 200%. The status pills now wrap at ≤900px; re-measured 0.
3. Fixed: event overview "View details" no longer clipped (1536, 1180, 125%, 390).
4. Fixed: tickets "More options" at 390 no longer clipped (footer groups wrap).
5. Fixed: plan and guest checkboxes are 24×24; no target under 24px on the re-measured routes.
6. Expected behaviour: plan-wizard map pin partly outside the map.
7. Logged: at 390 the ticket card's title link is 17px tall (a text link inside a heading; treated as exempt).

Not covered: provider/affiliate/portal/admin (lane A), organiser (lane D), 400% zoom, rotation with an open form, `/rsvp/<token>` (asserted for 404 in W13).

## Follow-up (2026-10-29, lane B, code only — re-measure pending in a browser slot)
- Auth inputs, links and buttons get a visible focus ring (2px outline + kit halo); forgot-password heading wraps below 1101px, removing the 11px overflow (`globals.css`).
- Event overview `.ce-item` grows and the body is tightened; "View details" no longer overflows (`customer.css`).
- Guest-table, plan-task and "Mark …" checkboxes are 24×24; other checkboxes keep the kit's 18px with 6px spacing.

## W14 — Customer & public design-final (2026-10-29, owner standard, lane B)
Standard: premium and consistent with the designs; one display scale (density.css); no component zoom; small differences logged.

| Surface | Refs | Verdict |
|---|---|---|
| Landing §1–§5, §7 (1672) | LAND #165–#170 | Matched. §4/§5 fixed this pass: mini features no longer collide; kickers wrap; §5 columns no longer overlap (minmax(0,fr) tracks, 62px max headline, one-row CTAs, dotted connectors). §6 Gala Agent: approved deviation. |
| Event / venue / service / organiser / London (1536, 390) | PUB-238–242 | Matched structure (W01 pass 3). Data residuals logged (tiers, photos, reviews). 390: 0 overflow, 0 unnamed. Built-feature gaps (maps, floor plans, menus, banners, page-editor settings) → separate packet in progress. |
| Customer desktop, 26 routes (1536) | CU-001–013, W01–W03 | Matched structure. Fixed: booking title clipped into the breadcrumb row. Book and ticket-setup are taller after zoom removal (same component sizes as every other page) — logged, not blocking. |
| Customer phone, 17 routes (390) | PWA #172–#223 | Matched structure (pass 4b); 0 overflow, 0 unnamed. |
| Plan wizard step 1 (390/360/768/1536) | — | Fixed: occasion tiles no longer squashed (≤640 full-row More); all 30 event types reachable; More menu opens in view at 768. |
| Ticket credential (320–1536, QR / Ticket / Barcode) | #108 / PWA #195 | Fixed: QR centred and square at every width; barcode never stretched; 320 stub QR overflow. Open: barcode modules are under 1 CSS px on phones (scanning risk) → scanning lane. |
| Logo (360–1920) | brand | Phones: mark only. ≥641 public/auth: full lockup. 641–1279 workspaces: PWA mark (MobileNav). Auth story panel + card lockups are by design. Open (owner): should tablets in workspaces show the full lockup? |
| Back controls (390) | — | Exactly one per page across 48 customer, organiser and provider pages (affiliate not covered: no demo affiliate password). |

Consistency: no `zoom` / `scale()` hacks in customer or public CSS (`.tk-date`, `.tk-date.lg`, `.rv-done` now real sizes); customer titles, buttons, inputs, card padding and card titles use the `--k-*` tokens.
Specs: plan-wizard-phone 3/3, one-back-control 3/3, ticket-credential-phone 8/8; customer + public e2e 51/51 after the W13 spec update (checkout step now expects "Tickets on sale soon" / "Join the waitlist" while the seller isn't ready).
