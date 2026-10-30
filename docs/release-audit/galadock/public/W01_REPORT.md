# W01: Public marketing & marketplace (pass 3)

**Runs:** passes 1–2 2026-10-28/29 · pass 3 2026-10-29 · Agent B (Opus) · dev :3107 · signed out unless noted. Evidence: scratchpad `b5/` (`cap/lp-*`, `rd/lp-*`, `cap/p-*`, `rd/p-*`, `cap/p-ph1/`, `tmp/fit.json`; tools `lp.mjs`, `region.py`, `fit.mjs`, `consist.mjs`).

## Summary
| Item | Result |
|---|---|
| Sign-off standard | Owner (2026-10-29): premium + consistent with the designs (structure, components, hierarchy), one display scale, no component zoom; region % is a hint; small differences logged. |
| Exit gate | PARTIAL — landing §1–§5, §7 and event/venue/service/organiser/London pages follow the reference structure; residuals data/minor; premium side-by-side sign-off pending on landing §4/§5. |
| Display scale | density.css only; no page/component `zoom` on public pages (landing ≥1400 is fluid: proportional fr tracks, `min(vw,px)` type). |
| Root-layout script warning | Fixed — `InlineScript` (`src/components/shared/inline-script.tsx`): runs before paint, no React warning; no flash at 1536/390/1672. |
| Cookie consent | Built (below). |
| Tests | `w13-public-controls` 4/4; customer e2e + public specs 40 passed, 1 skipped; tsc 0; eslint 0 errors. |
| Auth / onboarding after the shared zoom cleanup | Checked at 1536 and 390 (`/access`, organiser and provider step 1; steps 2–4 need a mid-onboarding fixture). 1536 clean. Fixed at phone width: access status pills wrap at ≤900px; provider "What do you offer?" choices stack at ≤480px (`globals.css`). |

## Per-route (area region % as a hint)
| Route | Ref | Pass 2 → 3 | Structure now | Residual |
|---|---|---|---|---|
| `/` §1 hero | LAND #165 | 71.7 → 11.4 | 2-line headline, bleed visual, 8-card mock, flow strip | Agent bar slot → rule-based "Next step" (no AI) |
| `/` §2 roles | LAND #170 | 16.5 → **2.0** | role cards with pinned mock-ups, CTA bottom-left | — |
| `/` §3 how it works | LAND #168 | 91.7 → 17.1 (leaf 5.0) | rebuilt window, tilted step rail, four cards | detector merge |
| `/` §4 professionals | LAND #167 | 78.8 → 42.3 | copy + window; three cards | mock internals — premium review pending |
| `/` §5 marketplace | LAND #166 | 53.3 → 14.9 | three columns, flow strip | note card wraps one more line |
| `/` §7 CTA + footer | LAND #169 | 40.2 → **4.7** | cards, CTAs, footer columns + Legal | no newsletter / social links (no backend/URLs) |
| `/` §6 Gala Agent | LAND #164 | — | approved deviation (no AI on public pages) | — |
| `/events/neon-nights` | PUB-239 | top fold 76.0 → 45.5 | rebuilt to PUB-239 (hero, tabs, about + tickets card, line-up, venue, experience, organiser/details/accessibility, photos, FAQ, similar, footer) | 6 tiers vs 4 (data); no video / add-to-calendar / weekend extras (no backend) |
| `/venues/riverside-arena` | PUB-240 | 68.6 → **19.5** | shared PUB template (hero mosaic, tabs, about + availability card, spaces, packages, upcoming, photos, reviews, location, similar) | no written reviews (data) |
| `/services/elite-sounds-dj` | PUB-238 | 52.3 → 61.7 | same template + "Why choose us?" | data-driven: 1 photo |
| `/organizers/[id]` | PUB-242 | 54.6 → 45.5 | rebuilt hero, tabs, upcoming/past, stats, about, gallery | no reviews / similar organisers (no source) |
| `/events/in/london` | PUB-241 | 63.8 → 60.2 | full-bleed hero, larger category tiles | no quick filters (read params), no newsletter |
| Phone 390 | — | — | profiles: hero → tabs → single column; 0 overflow, 0 unnamed | no public phone references |

## Cookie consent
Banner `src/components/shared/cookie-banner.tsx` (+ `cookie-banner.css`) in the root layout; hidden on admin, maintenance, scan and token pages; plain copy, **LEGAL REVIEW PENDING**; "Essential only" / "Allow analytics" (≥44 px); Cookies page "Change cookie choice", lists `gd_cc`. Route `POST /api/consent`: same-origin, 30/hour per IP, strict zod body; writes httpOnly `gd_consent` (`analytics:yes|no`, merged with existing values) plus a readable `gd_cc` marker; signed in also calls `record_consent('cookies_analytics', …, 'cookie_banner')`. No anon SQL function.

## Consistency
Public h1 56, section h2 24 everywhere; actions use `--k-btn-h`, primary CTAs `--k-btn-lg-h` / `--k-btn-lg-fs`.

## Remaining
1. Done (W14, 2026-10-29): landing §4/§5 side-by-side. §4 minis and kickers fixed; §5 column overlap fixed (minmax(0,fr) tracks, 62px max headline, one-row CTAs) and dotted connectors added. Phone logo is the G mark only.
2. Data: neon 6 tiers vs 4; single service photo; no written venue reviews; no organiser reviews/similar.
3. Not built (no backend): newsletter, event video, add to calendar, weekend extras, social links, London quick filters.
4. `/pricing` page (anchored section on `/`).
5. Q38 series/landing data; Q07 seller readiness (event page offers Buy while checkout refuses).
6. Legal review of cookie copy; referral pages overwrite `gd_consent`.
7. Public p1 fixtures (close-out).

## Follow-up (2026-10-29, lane B, code only)
- Fixed (decision 1): `/r/[code]/consent` and `/ref/[code]` merge into `gd_consent` through shared `src/lib/consent/cookie.ts` (`mergeConsent`), as `/api/consent` does. Spec `consent-cookie` 3/3.
- Fixed (decision 2): the event ticket card hides Buy while `event_payment_readiness` ≠ `ready` and shows "Join the waitlist" or "Tickets on sale soon"; checkout's refusal unchanged; spec `seller-readiness-ticket-card` 1/1. Follow-up assigned (lane C): `notify_waitlists` must skip events whose seller isn't ready.
- Remaining item 6 is now only the legal review of the cookie-banner wording.

### W01 Part 1 — public event page shows what the organiser built (lane C, 2026-10-29)
Owner report: "events from customer view not showing the built event maps nor the event features built like banners".
- Event map: published layout + venue structure (`public_event_plan`) via the shared `PublicPlan` (server-rendered SVG, pan/zoom/fit, legend, text list of areas); hidden when nothing is built; "Choose seats" only when seats exist and checkout can sell.
- Page editor honoured: saved block order (hero first) and visibility for all 13 blocks incl. new "map" (also the Sell public-page toggles); hero CTA labels with the TicketPicker launch/seller rules (shared `src/lib/public/ticket-cta.ts`); overlay dark/light/none; YouTube/Vimeo video as a link (CSP has no frame-src); SEO title/description in metadata (share-card/private rules unchanged). Preview tab is an iframe of the same route.
- New public sources: migration 202610294060 `public_event_extras` (confirmed sponsors/exhibitors: name, tier, booth; approved accessibility facts; days, venues, public sub-events, passes). Banners (public banner/wide assets + published promo pages), public galleries, merch on sale (list only), series/other dates, online sessions (no join links), programme grouped by day with stage/room.
- Customer views: ticket page map with the holder's tier/gate highlighted + programme + sponsors; `/account/events/[id]` layout; GA checkout collapsed map (server-rendered, no bundle growth).
- Specs: `tests/release/public-event-extras.spec.ts` 5/5; `tests/e2e/public-event-features.spec.ts` (390/1536, browser pending).
- Open (product): sponsor logos (no source), public parking/transport (no flag), merch checkout UI, video embed (CSP), holder map for private events, card fallback image is another event's artwork.

### W01 Part 2 — venue and service pages show what the provider built (lane C fork, 2026-10-29)
- Floor plan: published `venue_structures` via `PublicPlan` (Riverside Arena renders it).
- Menus: venues show their own menus plus the same provider's catering menus ("by …"); catering services their own. Shown: courses/items, dietary tags, declared allergens, per-guest/package price, guest range. Never: prep requirements, service window, costs. Migration 202610294061 re-scoped `menus_write` / `menu_sections_write` / `menu_items_write` from `TO public` to `TO authenticated` — anon menu reads were failing with "permission denied for function has_workspace_role".
- Galleries + banner shown when present (none today).
- Field audit: now shown — `features`, `info.*`, `access.*`, `fnb`, `hours`, `suppliers`, cancellation/deposit terms, service coverage/team/equipment/travel/included/excluded/add-ons/setup needs. Kept private — contact email/phone/website, compliance refs, operations, standby fee, emergency multiplier, holds, capacity limits. `show_price=false` honoured. Invented filler facts removed ("Ask the venue", "Flexible setup", "Travels to you", "Available"); rating hidden at 0 reviews; Verified chip also uses `listing_trust`.
- Space cards expand to layouts, dimensions, area, facilities, photos.
- Availability unchanged (per-date check in the booking card); a public free/busy calendar would need a new anon RPC (product decision). Providers have no page-editor settings except `pricing.show_price` (honoured).
- Spec `tests/e2e/public-listing-features.spec.ts` (Riverside Arena, Elite Sounds DJ, Gala Bites at 390/1536; browser pending).

### W01 Part 1/2 follow-ups (lane C, 2026-10-29)
- **Migration 202610294062 public_role_policy_scope:** 83 policies applied `TO public` and called helpers anon can't execute, so every anon read of 50 tables failed ("permission denied for function"), incl. published `bar_packages`, active `venue_rate_cards`, public `design_templates`, active `plan_prices` / `credit_packs` / `boost_products` / `ad_placements`. All rescoped to `authenticated` (same expressions); mixed policies' public branches re-granted as `*_anon_read` with no function calls. Exercise: no policies of the class remain; anon reads of 117 tables succeed and return only public rows; anon writes refused; outsider sees only published bar packages; member reads own draft. Post-apply: anon REST reads of the 50 tables 0 errors; q45-authz-sweep + RLS + venue-fnb + public-event-extras 31/31. (Incident: this file's own COMMIT escaped the dry run — see docs/release/governance.md.)
- **Bar packages** now show on venue/catering pages like menus (price, minimum spend, token/corkage prices, bar hours, minimum age; never licence refs, staffing, equipment, deposits). Rate cards not shown (pricing-engine rules; the booking card quotes via `venue_quote`).
- **No invented ticket facts:** "Main Gate A" and "start − 1h" doors removed from the ticket page, credential text and ticket list; gate from `settings.entry_gate` or the plan's only entrance, doors from the programme "doors" segment, otherwise omitted.
- **Owner decisions built:** merch = external "Shop merch" link (`settings.merch_url`, https + `assertPublicUrl`, re-checked on render; Ops › Merch & stock card); sponsor logos (migration 202610294063 `event_parties.logo_url` with https/event-media/png-jpg-webp CHECK, `party_set_logo` organiser-only + audited, public only for confirmed/completed parties via `public_event_extras`; uploads via `/api/files/public-media`, SVG refused); YouTube/Vimeo embeds (CSP `frame-src` youtube-nocookie + player.vimeo.com in both modes; strict id parsing, privacy mode, click-to-load with our own poster, sandboxed iframe). Specs video-embed + q45-csp + public-event-extras 15/15.

### Lane D — public availability + getting there (2026-10-29)
- Venue/service pages: opt-in free/busy calendar (`public_listing_availability`, 202610294080 + 202610294082). Day status only; default off; demo: Riverside Arena + Riverside DJ & Sound opted in. Free day → pre-fills the request date.
- Event page + ticket page: "Getting there" block (`public_event_getting_there`, 202610294081) — organiser-marked public notes, public car parks, public shuttles; directions link; hidden when empty. Demo: Neon Nights.
- Evidence: exercises EXERCISE_OK (4080/4081/4082); public-availability 5/5; public-getting-there 5/5; q45 authz sweep + RLS 19/19; db:parity clean (284/284); tsc 0. e2e `public-availability-getting-there.spec` (390/1536) pending browser.
- Follow-ups done: `settings.getting_there` moved to the private `event_getting_there` table (4083); saved block orders now get new blocks at their default position (`tests/release/page-blocks.spec.ts` 5/5).
- **P1 found by the audit (fix in progress):** anon and signed-in outsiders can read every `events` column on public events — financials (budget_total, revenue_goal, target_profit), client/CRM (client_name, client_id, lead_id), internal brief (goal, priorities), guest counts — and private `settings` keys (budget_lines, revenue_sources, objectives, risk, readiness, promotion_plan, ticket_pro.access.comps, invite_token, admin_restriction, requester_org). Pages don't render them; REST returns them.

### Browser verification — lane C (2026-10-29)
One browser (≥2 GB free). Dev server http://localhost:3107. Disposable identities via `E2E_AUTH_FIXTURE=otp`; all fixtures removed; Comedy settings restored.
- `tests/e2e/public-event-features.spec.ts` — 6/6 (Neon + Comedy @390/1536: event map + zoom + areas list, block order/visibility, hero CTA labels/state, banners, sponsors, a11y facts, no h-scroll; serial custom order / hidden blocks / CTA / light overlay, restored).
- `tests/e2e/public-listing-features.spec.ts` — 6/6 (Riverside, Elite Sounds, Gala Bites @390/1536: floor plan, menus, galleries/banner, no private strings).
- `tests/e2e/lane-c-checklist.spec.ts` — 5/5: merch link (http/localhost refused; Shop merch `target=_blank rel="noopener noreferrer nofollow"`); sponsor logo (SVG refused, PNG+JPG via Q04 upload, replace, remove; public box 88×48 object-fit contain @390/1536); video (bad link refused; zero YouTube/Vimeo/ytimg/googlevideo requests before click; no CSP Report-Only violations; hero jump to #video; youtube-nocookie embed with sandbox/allow/referrerpolicy; Vimeo dnt=1); ticket pages (no invented gate/doors; real gate shows); Riverside bar packages + Bar tab @390/1536.
- **Logo sizes (owner report "logo goes tiny"):** `tests/e2e/public/logo-size.spec.ts` — 30 routes @390/1536 pass. Real defects: landing + checkout header 40 px on phones (now 34), checkout header 40 on desktop (now 44), auth side panel em-sized 47.6–57.5 (now 44), landing footer 32 px with a 13.5 px wordmark (now 40). Standard (CSS px, page-fit scaling divided out): header 34 mark-only ≤640, 40–44 with wordmark above; auth card 46 / 38 ≤700; auth side panel 44; footers 40. Fixed centrally in `src/styles/brand.css` (px per breakpoint, no em; flex-shrink/min-width guards; no zoom).
- **Header/footer on every public page (owner report):** `tests/e2e/public/public-chrome.spec.ts` — 28 routes @390/1536 pass. Footer moved into `events/layout.tsx` (events, venues, services, organisers, /p, /series inherit it); legal and RSVP layouts gained the footer; new `src/app/not-found.tsx` (public header + footer + links to Events and Help); token portals (pay, guest, proposal, contract) and checkout get a logo-only brand bar + slim legal footer (`token-chrome.tsx`) — `/pay` no longer shows the full nav; auth cards and `/maintenance` minimal by design.
- Combined run 119/121 (2 dev-server restart refusals, re-ran 8/8); tsc 0; eslint 0 errors.

### Browser verification addendum — lane C (2026-10-29)
- Public chrome completed: `/ref/[code]` and `/r/[code]/consent` now PublicHeader + SiteFooter (new layouts; noindex + consent flow unchanged); `/payments/[ref]` now logo-only BrandBar + LegalFooter with noindex/no-referrer, and an in-chrome "Payment not found" (no double header from the root 404). `/promoter`, `/promoter/[id]` (signed-in promoter portal) and `/tickets/accept/[token]` (signed-in customer shell) are not public and keep their shells.
- Help Centre signed in (`tests/e2e/public/help-signed-in.spec.ts`, @390/1536): customer — avatar, "For customers" first, context "Customer account", footer; organiser via `/organizer/help` → `/help?from=organizer` — avatar, "For organizers" first, context "Organizer workspace" with workspace attached, footer. The contact form now shows "Sent from: …" (display only).
- `public-chrome.spec.ts` and `logo-size.spec.ts` extended with these routes; all pass @390/1536 (failures only on a dev-server restart, passed on re-run). tsc 0, eslint 0 errors.

### Browser verification — lane D (2026-10-29)
One headless browser, workers=1, RAM 3.6–6 GB.
- `tests/e2e/public-availability-getting-there.spec.ts` (390/1536): 4/4 (re-run 4/4 after the grid fix).
- `tests/marketplace/ticketing.spec.ts`: 7/7.
- `tests/e2e/customer/*`: 28 passed; "remove a saved event" failed only in the long run, passes alone and as a file (3/3); `booking.spec` "accept quote → deposit via Stripe Checkout": payment order created, no Stripe session → redirect timeout (path doesn't read `events`; assigned to the Stripe lane).
- `tests/e2e/public/*` + public-event-features + public-listing-features: 134 passed; 2 failures were dev-server restarts — re-run 8/8.
- Reader switch → `events_public`, data parity base vs view: event/checkout/register 56=56, home 56=56, discover 35=35, organiser 11=11, series 2=2, venue upcoming 0=0; 0 diffs in any settings key a public page reads (incl. `ticket_pro.sales`); dropped keys are private only.
- Manual pass 390/1536, signed out + demo customer: event, register, checkout, organiser profile, venue, `/r/[code]/consent`, discover, home, saved — all 200, 0 broken images, 0 console errors; £ prices, waiting-list rule, cover images, ratings/reviews, consent event name present.
- Logistics: "Notes saved but hidden" chip with notes off; public page drops notes, keeps public parking + shuttle; notes restored.
- Fixed: Getting-there grid sized by container (side-card preview was squashed).
- Fixed: customer discover @360/390 "View all events" link now wraps under its title (`cu-discover.css` `.ds-sec-head`); 0 overflow at 360/390/1536.
