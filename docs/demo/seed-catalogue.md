# Demo seed catalogue

All demo data uses reserved `@example.com` identities, is tagged `demo_showcase` / `demo_seed`, and is excluded from real reporting by `is_demo_workspace()`. Passwords (and the admin demo TOTP secret) live in the git-ignored `.env.local`. No real emails, SMS, Stripe charges, provider calls or AI calls.

## How to re-run
- Base demo: `node --env-file=.env --env-file=.env.local scripts/seed-demo.mjs` — **resets** the base demo; never run during captures.
- Q38 gap fixes + Stripe test sellers: `scripts/seed-q38-demo.mjs [--steps=…] [--links]`.
- Depth pass 1: `scripts/seed-depth-pass1.mjs [--steps=identities,events,compliance,partners,logistics,virtual,developer,ticketing,publish,guests,maps,core,portals]`.
- Depth pass 2: `scripts/seed-depth-pass2.mjs [--steps=plan,trust,providerops,hospitality,promotion,composition,risk]`.
- Both passes keep modules in `scripts/seed-depth/`, are idempotent (second run creates 0), log runs in `sandbox_seed_runs` (`depth-pass1` / `depth-pass2`), and use real commands as signed-in demo identities. Lifecycle goes through `event_transition`; the only bypass is `service_set_event_status` for the one historical event (audited). The `sql` helper retries on Management API 429.
- Direct writes — pass 1: historical rows (past check-ins, a risk-detector flag), platform templates, talent profiles; pass 2: Q04 upload-provenance and clean-scan fixture rows for generated placeholder files, and catalogue rows the app itself writes as RLS inserts (menus, bar packages, media assets, a festival event and its tiers), inserted as the signed-in demo user.
- Migration `202610293028_q38_provider_job_backfill` (service-only `service_backfill_provider_job`) creates jobs for lines confirmed before the trigger existed.
- Depth pass 3: `scripts/seed-depth-pass3.mjs [--steps=organiser]` (module `scripts/seed-depth/organiser.mjs`, runs logged as `depth-pass3`). Direct writes: Comedy programme items and talent profiles (RLS inserts as the organiser). Verify: `tests/release/demo-seed-organiser.spec.ts`.
- Verify: `tests/release/demo-seed.spec.ts` ("depth seed" and "depth seed pass 2" blocks).

## Identities
| Login | Role |
|---|---|
| alex.thompson@example.com | Customer (Alex & Taylor Wedding, Alex's 30th, Maya's 6th Birthday, …) |
| alex.events@example.com | Organiser owner, Alex Events (**Pro** plan since pass 2) |
| ops.lead.demo@example.com | Priya Nair, manager at Alex Events (safety plans, lost property) |
| james.carter@example.com | Member at Alex Events (door scanner, crew) |
| provider.demo@example.com | London Venue Collective, Premier Event Services, Riverside Arena |
| solo.supplier.demo@example.com | Mia Rossi Photography (solo supplier) |
| agency.demo@example.com + agency.manager / agency.staff / agency.finance .demo@example.com | Northern Crew Agency |
| ava.thompson@example.com | Ava Thompson, stage technician at Alex Events (crew login linked via crew_invite_login → respond_to_invite) |
| admin.demo@example.com | Platform admin (demo TOTP; plan change, trust reviews, featured rows, risk and legal holds, fixture purge) |

## Pass 1
- **Event types:** little-explorers-6th (children's party), future-of-live-events-webinar, hope-starts-here-charity-ball, warehouse-sessions-bassline, soho-late-lounge-fridays, halloween-rave-2025 (past).
- **Compliance (Q26):** licences, approved safety + crowd plans, accessibility, weather watch + contingency on 7 events.
- **Partners (Q24), logistics (Q25), virtual (Q29):** neon-nights, global-tech-conference, the webinar.
- **Developer (Q30):** disabled webhook on Alex Events.
- **Ticketing (Q20/Q22):** sunset-sessions presale (SUNSETPRE), final release, accessible allocation (ACCESS-SUNSET), SUNSET10, waiting room, open risk flag.
- **Guests and access (Q18/Q21), maps (Q19), core (Q14), portals (W09).**

## Pass 2
- **Plan + API (Q30):** Alex Events on Pro via audited admin plan change ("demo: API access showcase"); key "Demo partner feed (read-only)" with `feed:read` (hash only stored).
- **Hospitality (Q13):** Premier · Gourmet Catering Co "Summer Garden Feast" (plated, 3 courses, variants) and "Crew & Artist Catering"; Riverside Arena · Gala Bites "Arena Street Food"; bar packages "Prosecco & Craft Beer Open Bar", "Cash Bar with Minimum Spend", "Arena Hosted Bar". Alex's 30th catering for 76 (final numbers frozen), BEO-497223 approved; wedding open bar with corkage; Neon crew catering for 140 (BEO sent); green room, crew meal, late snack, VIP schedules.
- **Trust (Q08):** 14 verified documents on the 5 demo providers (public liability £1m–£10m, food hygiene, security, premises, fire, electrical); Northern Crew SIA expires within 30 days; placeholder PDFs with clean-scan fixture; verified business checks; all 37 demo listings Verified; reliability snapshots; a warning on Premier with open appeal; a review report.
- **Provider ops (Q10–Q12):** capacity rules with buffers, equipment, service areas (London, Bristol, Cardiff, Leeds, Manchester); Riverside Park layouts; Docklands Arena floor/bowl (exclusive group)/lounge; 10 backfilled jobs; BK-FDBFDD in Riverside Suite; equipment on Neon production job; job evidence; order groups on Neon and the wedding.
- **Promotion (Q23):** campaign "Neon Nights — final release push" (5 channel budgets; 1 message sent by fixture transport, 1 scheduled ~5 Dec; 3 links, 10 touches); consents (one opt-out); follows; brand kit with rules; public artwork with alt text and licence; public gallery; landing page `/p/alex-events-winter-nights`; editorial featured rows.
- **Composition (Q40):** "Soho Late Lounge Fridays" weekly series (7 events, Christmas override); "Warehouse Sessions: Bassline UK Tour" (Manchester, Leeds, Bristol, Glasgow); riverside-weekender-2027 (draft: 3 stages, Fri–Sun, 2 venues, day tickets + weekend pass); Taste & Tango waiver (adult + minor with guardian); Neon stock/merch with movements and transfer, one lapsed reservation; Food & Drink Expo lost property with verified claim; sustainability on Food & Drink Expo and Halloween Rave 2025.
- **Risk and privacy (Q33/Q32):** 7 risk signals (5 open incl. 1 escalated, 1 cleared, 1 actioned); payout hold on Northern Crew; step-up hold on agency.staff.demo (appealed); legal hold on Urban Events; retention preview history; consent history.

## Pass 3 (organiser depth)
Team leave (pending, approved ×2, rejected) and Ava's crew login; Global Tech registration form (4 approved, 1 rejected, 2 pending, 1 waitlisted), online track with a processing replay, 3 venues + 1 day; Neon max 8 per customer and 2 open purchase_limit risk flags, staff and guest forms with responses, 5 dependencies (approval pending: "Volt signs off the DJ line-up"); Summer Sessions lost-property match + 3 found items; sustainability measured on Summer Sessions, estimated on Neon; Comedy Central partners, slots, riders and logistics; Fizzbox party portal (disposable p1- login); Premier emergency profile, Neon emergency request, Elite Security booking disputed.

## Waiting / not yet seeded
- Resale listing — needs an issued Stripe-paid original order (`guard_resale_original_payer`); none exists for the demo customer.
- Paid orders: resale demo, past-event sales, paid merch, weekend-pass sales, campaign revenue — after the owner's Q07 Stripe test onboarding.
- 7 confirmed Premier lines on events owned by a non-demo account have no job (left untouched).
- Neon `video_url` (owner URL); weather provider key; ClamAV gateway (real scans of placeholder files).

## Never touch
p1-* test workspaces — the audited purge command handles them.
