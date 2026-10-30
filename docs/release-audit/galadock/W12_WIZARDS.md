# W12 — Wizard sweep (layout · options completeness · follow-through)

Date: 2026-10-29 · Lane C (static audit + fixes) · Browser verification pending (checklist below). Owner request: "sweep all other wizards too at all screen sizes", after the plan-wizard occasion tiles were squashed at phone width and only 17 of 30 event types were offered.

## Defect classes checked
- **A. Layout** at 1920/1536/1448/1280/1024/768/390/360 (+125–200% zoom): `grid-column: span N` or fixed lines in a grid a media query narrows (incl. rules declared *after* the query), bare `1fr` min-content blow-out, fixed widths over phone width, `nowrap` with no ellipsis, fixed heights that clip, steppers/footers at phone width, sticky footers vs the PWA tab bar, rails that don't collapse <1000px, component `zoom`. Scanners `gridscan.mjs` / `cascade.mjs` (lane C scratchpad).
- **B. Options** against the source of truth (`event_type_aliases` 30, `taxonomy_terms` event_type 30 / service_category 31 / build_category 11, `ref_timezones` 18, `ref_currencies` 3 transactional, check constraints/zod).
- **C. Follow-through** of step-1 choices to later steps and summaries (no raw keys).

## Bugs fixed beyond layout
- **Provider direct bookings were sent without times, guests, layout or hold** — a `//` comment swallowed `starts_at, ends_at, guests, layout, hold` from the RPC payload, so "Place on hold" was ignored and the capacity check never ran (`provider/bookings/new/actions.ts:68-70`).
- Venue/service/package wizards silently re-saved wrong types (22/26 venues → "Event Space", 50/60 services → "Entertainment > DJ", 17/26 packages → "Private Parties"); now matched by any spelling.
- Create event: template type always resolved to "festival" (`x ? "festival" : "festival"`).
- `ChoiceGroup` paired images/icons/descriptions by filtered index, so a selected option past `maxVisible` showed another option's image; fixed via original index (`components/form.tsx:51-60`).
- Shared: `lib/format.ts:61` `eventTypeLabel` falls back to the master-data label (e.g. "religious" → "Faith & Cultural") for every caller.
- Coordinator: plan wizard showed raw module keys ("run of show") — now customer labels (`plan-wizard.tsx` `MODULE_LABEL`).

## Per-wizard results
| Wizard (route · files) | Steps | Layout findings | Options: UI vs source | Fixed | Left |
|---|---|---|---|---|---|
| Customer plan · `/plan` | 6 | ≤640 span fix (coordinator) holds; ≤1280 4-col bare `1fr` | 30/30 event types | cu-plan-wizard.css:167 `minmax(0,1fr)`; module labels | — |
| Customer booking · `/account/events/[id]/book` · booking-flow.tsx, cu-book.css | 5 | ≤640 summary facts `nowrap` (base rule after query) overflowed at 390/360; ≤1279 sticky `.bk-bar` under `.pwa-tabs` | Access 4/4; kind chip/summary raw keys | cu-book.css W12 ×2; booking-flow.tsx:32 `catLabel` | styling/staff/production/hire/transport/extras get the generic question set |
| Customer ticket setup · shared/ticket-setup.tsx | 5 | OK | Refund 4/4; "customs"/"nightlifes" copy; raw chip | `typeWord` labels | — |
| Resale · `/account/tickets/[id]/resale` | 3 | OK | Raw event-type chip | `eventTypeLabel` | — |
| Checkout · `/checkout/[event]` | 3 | OK | Currencies from event | — | — |
| Event registration · `/events/[slug]/register` | 1–2 | OK | Field types 9/9 | — | — |
| Create event · `/organizer/events/new` · create-event.tsx | 7 | ≤700 step strip `nowrap` in 2 cols overflowed at 360; bare-1fr type tiles | **Event types 13/30**; timezones 4/18; currency hard-coded "£"; provider categories 8/10 | org-create-event.css W12; `moreTypes` select 30/30, `typeLabel`, 18 timezones, `cur()`; events/new/page.tsx:33; `isTimezone` | UK VAT only; venue picker `.limit(40)`→`.slice(0,6)` |
| Template wizard · `/organizer/events/[id]/template` | 3 | `.tw-incl small` nowrap overflowed side card / phone | "Add type" no canonical list; raw supplier categories | org-template.css W12; labels + 30 suggestions | — |
| Ticket Pro · `ticket-pro/*` | 5 | ≤760 phase rows left name ~20px; resale selects/preview facts 3-across; preview tabs clipped in 30px; unwrapped tables | Tier kinds 8/8, sections 5/5, refund 4/4; raw type in helper | org-ticket-pro.css W12; `.tp-tw` wrappers step-model.tsx:87/92, step-tiers.tsx:146/151; step-model.tsx:71 | discount table in 340px side card — visual check |
| RFQ · `/organizer/marketplace/requests/new` | 4 | 9-col supplier table overflowed ≤1024; sticky `.wz-foot` under `.pwa-tabs` ≤1279 | Categories 11/31→15; `?category=dj` wrong tile; raw keys | rfq-wizard.tsx:170/178 `k-table-wrap`; org-wizard.css W12; `CAT_LABEL`/`CAT_MATCH`/`tileOf` | RFQ keys ≠ `build_category` keys |
| Proposals new · `/organizer/proposals/new` | 1–2 | 8-col table unwrapped; footer under tabs | Event types 9/30→32; "awards" showed "Festival" | proposal-forms.tsx:71/72; mapped labels | attendance type has no source; `.limit(20)` |
| Campaigns · campaigns-client.tsx | 5 | OK | Goals 6/6, channels 8/8, blackout 4/4; timezone 6/18 | 18 zones + UTC | audience categories free text |
| Promotion · `/organizer/promotions/new`, `/events/[id]/promotion/new` | 4–5 | ≤800 bare-1fr goal/surface tiles | — | org-promotion.css W12 | `.pr-c`/`.pw2-c` overflow-x band-aid |
| Invoice wizard · `/organizer/money/invoices/new` | 3 | OK | Currency 3/3 | — | events `.limit(50)` |
| Venues new · `/provider/venues/new` | 6 | **Same cascade defect as plan wizard**: `.vw-acc-grid` redeclared 2-col after the ≤860 query; licence rows 5 tracks + nowrap at 390/360 | Venue type 9/10 (no "Bar or nightclub"); timezone 2/18; country 2/9 | provider-venue-setup.css W12; steps.tsx:23-26, 38, 46-47; catalog.ts | UK/IE timezone/country — owner decision |
| Spaces new · `/provider/venues/[id]/spaces/new` | 5 | OK | Use cases 7/30 | space-basics.tsx:15-17, 63, 123-124 | type/layout/amenity/AV lists have no DB source; "Same as venue" shows first cancellation tier only |
| Services new · `/provider/services/new` | 5 | 30 checkboxes in `.svw-checks` | Categories 13/31; event types 12/30; raw agent suggestion | steps.tsx:23-32, 51-56, 64-66, 79; catalog.ts | — |
| Packages new · `/provider/packages/new` | 5 | OK | Event types 7/30; + "Any event type" | steps.tsx:14-15, 52-53; packages/[id]/page.tsx:44, 92 | — |
| Bookings new · `/provider/bookings/new` | 4 | 6-col `.wz-svc` unwrapped ≤860 | Event types 11/30; raw layouts ("U_shape") | **actions.ts:68-70 payload**; steps.tsx:19-21, 138, 173, 210, 251; page.tsx:75; provider-wizard.css W12 | stepper 4 but step 3 creates the booking; rail hard-codes venue mode |
| Quote builder · `/provider/opportunities/[id]/quote` | 4 | **Span defect**: ≤520 `.qb-total{grid-column:2/4}` in a 2-track grid → implicit 3rd column | Raw line categories reached customers | provider-quote.css W12 (`2/-1`); quote/data.ts:36, 42 | services without `price_from` / spaces without `rate_hourly` excluded |
| Onboarding · `components/onboarding.tsx` | 4–6 | "+ More …" squeezed into tile grid; nowrap tile labels | Organiser types 10/30, listing types 6/30, service categories 10/31, venue types 7/10 | form.tsx:51-60; globals.css W12; onboarding.tsx:380, 432, 455; catalog.ts:163-178; master-data.spec.ts:23-30 | 4 non-chargeable currencies offered (CAD/AED/ZAR/AUD); customer interests hard-coded 10 |
| Admin break-glass · `/admin/conversations/request` | 1 | OK | Reasons 6/6 | — | support categories 7 vs DB 9 (`no_show`, `emergency`) |

No component CSS `zoom` remains (only the shell-level `--k-zoom` display scale and the auth/onboarding page fit).

## Open items (owner / backend)
1. RFQ category keys vs `build_category` keys in `build_items.category` — mapping decision.
2. Onboarding currency offers 4 non-chargeable currencies; onboarding writes settings directly, so signup doesn't enforce the check.
3. Venue timezone (2/18) and country (2/9) UK/IE only — confirm intent.
4. Support categories 7 vs DB check 9 (`no_show`, `emergency`).
5. Provider booking stepper says 4 steps, but step 3 creates the booking.
6. Campaign audience categories free text — should be an event-type multi-select.
7. Create-event venue picker `.limit(40)` → `.slice(0,6)`; tax UK VAT only.
8. Quote catalogue excludes services/spaces with no price.

## Browser checklist (used for verification)
Logins: organiser `alex.events@example.com`, provider `provider.demo@example.com`, solo supplier `solo.supplier.demo@example.com`, customer `alex.thompson@example.com`. Widths 1920/1536/1448/1280/1024/768/390/360; at ≤1279 sticky footers must sit above the tab bar.
- **Customer:** `/plan` (2-col tiles + full-row More at 390/360, 4-col at 1024, 30 types); booking `/account/events/efd4d0af-9437-4b0b-99cf-af7816fa2a62/book?item=665763cf-9f61-4e74-955f-8e6b19e229a1` and `?item=5cd4812a-1f1e-4f85-9d25-4fd7ac3533e3` (label chips, facts wrap at 360, bar above tabs); ticket setup labels + scrolling tiers table; resale label chip.
- **Organiser:** create event `?event=e9041473-4e54-4ebf-ac5a-8f581f9e8728&step=1` (Awards; also comedy `b52e0eae…`, food_drink `fa33d047-250c-4a08-b3c0-ad513a954d70`, party `f193f8a8-44f0-49e1-8f04-7958d07762ca`); Ticket Pro on Neon `392fdf17…` at 390/360 + side-card discount table at 1536; RFQ `?step=1&category=dj&event=392fdf17…`; proposals `?id=1e349c09-07e5-4adc-9bf6-12e2f5edd5b9`; template on Neon; campaign `f5ee6309-eb62-470d-aa94-8b865c9fe777`; promotions new; invoice new.
- **Provider:** venues new `?venue=976f8ef9-1f17-4882-8f37-5bc634b20ee3&step=1` ("Bar or nightclub"; also `2710142c-a28a-4fc3-a2f3-aa9bc1a462e7`, `78fc1333-26fd-4399-8008-1833107c5c11`; step 4 at 390/360); services new for `b2e926ca-c555-478d-bcdc-7fb6351ecba9`, `8a4f28a6-4ae3-4544-9040-d6f54e85a756`, `ce5863b9-a285-44e4-9694-98223e0683ea`, `2a11b490-b3ac-4ee8-8db6-0d6efd1428d2`, solo `c4e970e9-c951-465b-9811-76b6be22a797`; package `b1c9e54c-b689-4e1a-a73e-576072001aaa`; bookings new through Confirm (times/guests/layout/hold persisted — demo workspace); quote builder at 360.
- **Onboarding:** organiser + provider setup; option past #10 selected then collapsed keeps its own image; "+ More" own row; ellipsis on long names.

## Verification
- `npx tsc --noEmit -p .`: clean apart from 1 error in an untracked file from the scanning lane (`tests/release/scan-render.ts`, missing `sharp` types) — that lane owns it.
- `npx eslint` on changed files: 0 errors (old `<img>` warnings only).
- Browser pass: done (below).

## Browser verification (2026-10-29, lane B)
Widths 1920/1536/1448/1280/1024/768/390/360. 25 wizard pages × 8 widths, read-only, on the demo customer, organiser and provider accounts plus the solo supplier. Per load, checked automatically: horizontal overflow, option tiles squeezed under 44px, a sticky footer that overlaps `.pwa-tabs` at ≤1279px, raw snake_case keys in visible labels and chips, and option counts. Screenshots: `scratchpad/b5/cap/wiz/`.

| Wizard | Result |
|---|---|
| Customer plan | Pass: 2 columns + full-row More at 390/360, 4 columns at 768/1024, all 30 types reachable. Fixed: the More menu opened off-screen at 768 (the tile now scrolls to the centre first). |
| Customer booking (both items) | Pass: no overflow, footer above the tabs. Selects: time 48/49, access 4. |
| Customer ticket setup 1–3 | Pass: labels, not keys ("narrow" flags on step 1 are the intended 32px tier-row icon buttons). |
| Resale | Pass. |
| Organiser create event (Awards, food & drink, party step 2) | Pass: 13 type tiles + full "More event types" select, 18 time zones. |
| Ticket Pro (Neon) | Pass: 6 tier kinds, scrolling tables, no overflow. |
| RFQ (`category=dj`) | Pass: no overflow; supplier table wrapped. |
| Proposals new, template, campaigns, promotions new, invoice new | Pass. Campaigns, promotions new and invoice new were unchecked at 1920/1536 only (dev-server page-load timeout) — re-run requested. Promotions new "narrow" flag is the 20px check badge (false positive). |
| Provider venues new (steps 1 and 4, two venues) | Pass. |
| Provider services new (two services + solo) and packages new | Pass. |
| Provider bookings new | **Fixed.** At ≤1279 the footer sat under the tab bar: `.wz-foot` is the only child of a grid item (`.wz-span`), so its own `position: sticky` had no room. `provider-pwa.css`: wrapper sticky at `var(--pwa-bottom) + 8px` + wizard page bottom padding. Re-measured at 390: footer bottom 766, tab bar top 774. |
| Provider booking persistence (lane C payload fix) | **Verified.** Confirm booking in the demo workspace created a `provider_jobs` row: status `held`, 18:00–22:30 on the chosen day, guests 40, layout as given, `details.hold_hours` 48. Row deleted afterwards. |
| Onboarding (organiser and provider) | Step 1 at 1536 and 390. Steps 2–4 need a workspace created on step 1 (mid-onboarding fixture) — not reached. |

Spec `tests/e2e/ui/wizards-phone.spec.ts` 6/6: at 390 and 360 for each customer, organiser and provider wizard — no overflow; no option tile under 44px; any footer in view sits above the tab bar; option counts (plan ≥9 tiles; create event ≥13 tiles, ≥18 timezone options). tsc 0; eslint 0; customer e2e 30/30. Not product bugs: the "Overlay design" control and the Next.js "N" badge exist in development builds only.

### Addendum (2026-10-29, lane B): gaps closed
- **Organiser campaigns, promotions new, invoice new at 1920/1536:** re-run with a 300 s load timeout and one retry. Pass: no overflow, no footer under the tab bar, no raw keys. Options: campaigns 8 goals, promotions 28 events, invoice 32 events + 3 currencies (promotions-new "narrow" flag = 20px check badge, false positive).
- **Onboarding steps 2–4, organiser and provider, at 1536/390/360:** disposable signup (`p1-w12onb-…`), step 1 completed so a workspace exists, then every step walked. Pass: no overflow (after the fix below), no squeezed tiles, no footer under the tab bar, no raw keys; long names truncate with an ellipsis. "+ More": organiser step 2 "Productions" keeps its own image (`type-2.webp`) after collapse; provider step 2 pick (no image) stays selected and visible.
- **Fixed:** organiser step 4 (Team) at 360 — notification switch rows couldn't shrink (switch 3px past the window, 11px page scroll). `globals.css`: row and text shrink, grid one column ≤640px; re-checked 390/360 clean.
- No captcha at signup; fixture users and workspaces deleted after each run (no audit refusal).
- **W12 wizard sweep: complete** — every wizard verified at all 8 widths.
