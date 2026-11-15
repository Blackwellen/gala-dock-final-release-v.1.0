# Q72 internationalisation: gap register

Lane i18n, 2026-11-14. Scope set by the owner: "internationalisation in depth: functionality, rules, wizards, management, customers,
laws, builds, AI agent, data, functions, all features, suppliers, marketplace, venues, tickets, locations".

The model follows the owner's legal decision D2 (Q54), which aligns with Gigvora's
`docs/commercial/pricing-and-internationalisation-plan.md` §12:

- Sellers and buyers can be in every supported country, including the EU, and consumers are included.
- Sanctioned places are excluded. The list belongs to Q74 (`src/lib/legal/sanctions.ts`).
- EU VAT goes through the non-Union OSS (Ireland).
- The UI is in English only for now. There is no language switcher (as on Gigvora). The document is `lang="en-GB"`. The user's
  language preference is stored and Gala Agent replies in it.

Severity levels:

| Severity | Meaning |
|---|---|
| **P0** | Wrong money or legal exposure in a live flow |
| **P1** | Wrong result for non-UK users |
| **P2** | Incomplete or misleading for non-UK users |
| **P3** | Polish or readiness |

Status values:

| Status | Meaning |
|---|---|
| **FIXED** | Built in Q72 (files listed) |
| **PARTIAL** | Fixed on the key surfaces, with a named remainder |
| **OPEN** | Not built; there is a PHASE B item |
| **HANDOFF** | Belongs to another lane, which is named |

The source of truth for facts is `src/lib/i18n/` (pure modules, tested in `tests/release/q72-i18n.spec.ts`):

| Module | Covers |
|---|---|
| `tz.ts` | Time zones |
| `money.ts` | Money |
| `countries.ts` | Country profiles: postcode, address, phone, units, consumer law, alcohol, licence packs, resale, cookies, tax display |
| `rules.ts` | Buyer notices |
| `messages.ts` | Message catalogue |
| `workspace.ts` | Workspace locale defaults |

These are references for product copy and defaults, **not legal advice**. Every legal row is `reviewed: false` until counsel
confirms it (D14).

---

## 1. Time (I18N-T)

| ID | Sev | Gap (before Q72) | Status | Where |
|---|---|---|---|---|
| T01 | P0 | The create-event **timezone selector was cosmetic**. Wall times were always converted as London (`wallToIso` had no zone), so a 19:00 Paris event was stored at 18:00 UTC (BST) instead of 17:00 UTC. | **FIXED** | `src/lib/events/wall-time.ts` (zone parameter, London default), `src/lib/i18n/tz.ts` (`zonedToUtc`, gap → forward, overlap → first occurrence), `src/components/organizer/create-event.tsx` (`iso(local, s2.timezone)`; the preview is zone-free), `src/lib/actions/create-event.ts` (the server converts in the chosen zone), `src/app/organizer/events/new/page.tsx` (seeds the inputs in the event's zone) |
| T02 | P1 | New events always started as Europe/London / GBP whatever the workspace country. | **FIXED** | `create-event.ts` step 1 inserts `timezone`/`currency` from `workspaceLocale(settings)`. The DB trigger `i18n_events_locale_defaults` sets `events.country`. |
| T03 | P1 | Buyer surfaces rendered every event time in London: event page, sections, checkout, waiting room, confirmation, My Tickets list and detail. | **FIXED** | `src/app/events/[slug]/page.tsx`, `src/components/public/event-sections.tsx`, `src/app/checkout/[event]/{page,client,waiting-room}.tsx`, `confirmation/page.tsx`, `src/lib/data/customer-tickets.ts`, `src/app/(customer)/account/tickets/{page,[id]/page}.tsx`. The zone is named (BST/CEST/EDT). The ticket PDF already used `events.timezone`. |
| T04 | P2 | No viewer-local time. | **FIXED** | `src/components/shared/local-time.tsx` `LocalTimeHint`: "(18:00 your time)" when the browser zone differs. It renders nothing on the server or when the offsets match, so UK users see no change. Used on the event page and at checkout. |
| T05 | P1 | UTC "today": the invoice issue date, the RFQ respond-by minimum, the proposal validity check, the saved-event date minimum, the contract expiry, compliance due-date colouring and logistics cutoffs all used `new Date().toISOString().slice(0,10)`, which gives yesterday between 00:00 and 01:00 BST. | **FIXED** | `todayIn(tz)` / `useToday()`: `invoices/new/page.tsx`, `invoices/[id]/page.tsx`, `rfq-wizard.tsx`, `proposal-forms.tsx`, `lib/actions/proposals.ts`, `customer/saved-client.tsx`, `contract/[token]/page.tsx`, `sections/compliance.tsx`, `sections/logistics.tsx`. |
| T06 | P1 | Organiser event header and overview showed the time without the zone. | **FIXED** | `components/organizer/event/{header,overview}.tsx` (`zoneAbbr`, `whenInZone` in `lib/format.ts`). |
| T07 | P1 | **Release dates** (DEC-107 ticket payout window): `dec107_add_business_days` counts London weekdays and England & Wales bank holidays for every seller. | **PARTIAL**. Rule defined and built as a pure helper; SQL callers belong to the payments lane. | Rule: count Mon–Fri in the **event's** zone. Skip `uk_bank_holidays` only when the seller's business country is GB (region from the venue). Other countries skip no holidays until a holiday calendar for that country is loaded; payouts may then release on a local public holiday, and the bank decides arrival. `src/lib/i18n/tz.ts` `addBusinessDays` (tested). PHASE B: `dec107_add_business_days_in(p_from, p_days, p_tz, p_country)` in SQL. |
| T08 | P1 | Sale windows (`ticket_tiers.sale_start/end`) are instants, which is correct. Labels showed London. | **PARTIAL** | Checkout "On sale …" uses the event's zone. The organiser ticket-pro editor still edits in London (`ticket-pro/ui.tsx toLocal = isoToWall(iso)`): it needs the event's zone passed through (PHASE B). |
| T09 | P1 | Reminders and notification bodies are composed **in SQL** with `at time zone 'Europe/London'` (24 migrations, e.g. `202610170001_marketplace.sql:544`, `202610280012_team_conflicts_v2.sql:40`, `202610291021_search_foundation.sql:115`). | **HANDOFF** (messaging lane) / OPEN | PHASE B: a `public.fmt_event_time(ts, tz)` SQL helper, then use `e.timezone` in each body. |
| T10 | P2 | Routine schedules (Gala Agent and provider routines) run on London cron. | OPEN (by design for now) | `src/lib/agent/schedule.ts` `SCHEDULE_TZ`. The compiled trigger already stores `tz`; honour it per workspace in PHASE B. |
| T11 | P2 | Provider calendars, availability and quote timelines are London (`lib/provider/london-month.ts`, `opportunities/[id]/quote/page.tsx fmtTime`). | OPEN | Needs `listings.timezone`, added in Q72. Use it in `london-month.ts` (PHASE B). |
| T12 | P3 | `dateLong` and others on a bare `YYYY-MM-DD` read it as UTC midnight, which was harmless in London and shifts a day in the Americas. | **PARTIAL** | Fixed in `event-sections.tsx` `day()`. A general audit of `lib/format.ts` callers is PHASE B. |
| T13 | P3 | 132 files still name `Europe/London`. Most are London-default displays of instants, which is correct for UK data. | OPEN | The checklist in PHASE B lists the non-buyer surfaces (admin, provider, organiser lists). |

## 2. Currency (I18N-C)

| ID | Sev | Gap | Status | Where |
|---|---|---|---|---|
| C01 | **P0** | **Ticket checkout charged GBP whatever the event currency.** `checkout_quote` returned `'currency','GBP'` and the session route sent `currency: "GBP"` to Stripe and the order, so a €25 ticket was charged £25. | **FIXED** | Migration `202611147251`: `event_checkout_currency()`, `checkout_quote` returns it, and the BEFORE INSERT guard `checkout_orders_currency_guard` pins the order currency and refuses non-two-decimal currencies. `src/app/api/checkout/session/route.ts` uses `sum.currency` and `toMinorUnits(n, currency)`. |
| C02 | P0 | The Stripe minor unit was hard-coded ×100 (`payments/rules.ts toMinor`), which is wrong for JPY (zero-decimal) and the Stripe special cases (HUF, ISK, TWD, UGX). | **FIXED** for checkout / guarded elsewhere | `src/lib/i18n/money.ts` `toMinorUnits`, `minorDigits`, `ZERO_DECIMAL`, `STRIPE_SPECIAL`. JPY and HUF are **not transactional** until the SQL quote handles minor digits. `toMinor` in `payments/rules.ts` still assumes ×100 for bookings and merch, which is safe because only two-decimal currencies are transactional. |
| C03 | P1 | Buyer prices were hard-coded `£` / GBP: the event-page ticket picker, checkout, merch, confirmation and JSON-LD `priceCurrency`. | **FIXED** | `public-event-client.tsx` (`currency` prop), `checkout/[event]/client.tsx`, `event-sections.tsx`, `events/[slug]/page.tsx` (`priceCurrency: CUR`), `confirmation/page.tsx`. |
| C04 | P1 | Currency was not stated clearly at checkout. | **FIXED** | Currency notice ("Prices are in Euro (EUR)…"), tax note and zone note from `src/lib/i18n/messages.ts`, shown in the checkout summary. |
| C05 | P1 | **Seller currency vs booking currency.** Marketplace payment orders charge in the **event** currency (`202610280005` create-payment-order: `coalesce(e.currency,'GBP')`), but `provider_quotes.currency` was always GBP. | **FIXED** (quote stores the charged currency) / HANDOFF | Migration `202611147252` trigger `i18n_quote_currency`. The quote builder shows the event currency (`opportunities/[id]/quote/builder.tsx`, `page.tsx`; `lib/provider/queries.ts` selects `currency`/`timezone`). **Owner decision O2**: charge bookings in the seller's (listing/Connect) currency instead? That is a payments-lane change. |
| C06 | P1 | Seller currency did not follow the Connect account. | **FIXED** | Migration `202611147251` trigger `i18n_connect_currency_default`: `connect_accounts.default_currency` becomes `workspaces.settings.currency` when none is set. `money.ts sellerCurrency()` applies the same precedence in TS. New listings take the workspace currency (`i18n_listings_locale_defaults`). |
| C07 | P1 | Only GBP/EUR/USD were transactional, but sellers can be in 36 Connect countries. | **FIXED** | `src/lib/master-data/catalog.ts` and migration: CAD, AUD, NZD, CHF, CZK, DKK, HKD, NOK, PLN, RON, SEK and SGD are transactional. HUF and JPY are display-only. Bulgaria is EUR (from 2026-01-01). |
| C08 | P1 | Listings had no currency (`price_from` was assumed GBP). | **FIXED** (data) / PARTIAL (UI) | `listings.currency` added and backfilled to GBP, with an insert trigger. Create-event venue cards use it. `components/customer/public-listing.tsx` `money()` is still `£` (PHASE B, admin/marketplace screens). |
| C09 | P1 | Ticket-pro editor: `ticket-pro/ui.tsx gbp/gbp2`, `step-tiers.tsx £`, `step-access.tsx "Payout currency GBP (£)"`. | OPEN | Needs the event currency threaded through the wizard (PHASE B). |
| C10 | P2 | Other hard-coded `£` in transactional UI: `shared/ticket-setup.tsx`, `customer/booking-flow.tsx`, `organizer/rfq-wizard.tsx` (budget label), `invoice-wizard.tsx`, `venue/rate-cards.tsx`, `venue/menus-client.tsx`, `provider/venues/new/steps.tsx`, `provider/bookings/new/steps.tsx`, `marketplace/lifecycle-client.tsx`, `dispute-client.tsx`, `emergency-client.tsx`. Marketing pages and Gala Dock's own GBP plans are fine. | OPEN | 248 `£` and 166 `"GBP"` occurrences in `src`. List: `grep -rn "£" src`. |
| C11 | P1 | SQL notification and email bodies hard-code `£` (25 migrations, e.g. `202610140001_customer_booking.sql:94`, `202610140009_invoice_ops.sql:34`, `202610170001_marketplace.sql:310`). | **HANDOFF** (messaging lane) | PHASE B: a `public.fmt_money(amount, currency)` SQL helper. |
| C12 | P1 | **Admin reporting adds across currencies** (`admin/(console)/commerce/data.ts gmv/platformRevenue/bySource`, and the Q75 `admin_commerce_summary`). | **HANDOFF** (admin lane, Q75, actively editing) | Use `money.ts totalsByCurrency` / `formatTotals`, or `group by currency` in SQL. Never sum EUR into GBP. |
| C13 | P1 | Payout settlement currency: a EUR charge on a GBP-settling account settles in GBP, but `payout_releases.currency` = the charge currency and `releases-core.ts` groups by it. | **HANDOFF** (payments lane) | Release amounts must come from `balance_transaction` (net, settlement currency). Until then, keep event currency = Connect default (the default since Q72). |
| C14 | P2 | Fee schedule (`ticket_fee_config` fixed fee) is in GBP and applied 1:1 in the event currency (£0.49 becomes €0.49). | OPEN, owner decision O3 | One fee catalogue per currency (as Gigvora §12.6). |
| C15 | P2 | Resale is GBP-only (`guard_resale_original_payer` requires `upper(o.currency)='GBP'`). This fails safe: non-GBP tickets can't be listed for resale. | OPEN (payments lane) | Allow the original order's currency. |
| C16 | P3 | `lib/format.ts` / `workspace/format.ts` `money()` now go through `formatMoney` (Intl by currency, JPY decimals, unknown codes don't throw). | **FIXED** | |

## 3. Locations (I18N-L)

| ID | Sev | Gap | Status | Where |
|---|---|---|---|---|
| L01 | P1 | Coverage filters ("covers my event", "based within") knew only **12 UK cities** (`lib/marketplace/coverage.ts CITY_POINTS`). Any other city silently disabled the filter. | **FIXED** | `src/lib/maps/geocode.ts` `placePoint()`: city table first, then MapTiler geocoding (`MAP_TILER_API_KEY`, the key the map tiles already use; checked by name only, value never printed), else Nominatim, cached 24h. Used in `organizer/marketplace/page.tsx` and `lib/actions/provider-search.ts`. |
| L02 | P1 | Venue setup geocoded **GB/IE only** (`countrycodes=gb,ie`) and required a postcode everywhere. | **FIXED** | `provider/venues/new/actions.ts`: geocodes in the venue's country, postcode is optional where a country has none (HK, AE), `checkPostcode` per country, phone in E.164, timezone defaults from the country. |
| L03 | P1 | `/api/maps/geocode` was English and worldwide but duplicated the logic. | **FIXED** | Uses `geocodePlace`; optional `?country=`. |
| L04 | P2 | The coverage radius was miles only. | **FIXED** | Stored in miles (`radius_miles`); typed and shown in km outside the UK/US (`provider/services/new/{page,steps}.tsx`, `services/actions.ts` `unitToMiles`). The public listing shows "N miles (M km)". |
| L05 | P2 | Postcode validation was UK-shaped or absent. | **FIXED** (helper and venue) / OPEN (other forms) | `countries.ts checkPostcode` (38 countries). The onboarding address and `tax-details.ts postal_code` (Q74) should use it. |
| L06 | P2 | Address formats. | **FIXED** (helper) / OPEN (forms) | `addressFields(country)`, `formatAddress()` (UK, EU, NA and JP orders). PHASE B: adaptive address form. |
| L07 | P2 | Phone numbers were free text. | **FIXED** (customer profile and venue contact) / OPEN (others) | `normalisePhone()` to E.164 (structural check). `lib/actions/account.ts` stores E.164. PHASE B: workspace contact and team phones; optionally swap in libphonenumber. |
| L08 | P2 | `listings.country` / `listings.timezone` did not exist. | **FIXED** (data) / OPEN (writes) | Columns, backfill and insert trigger. `provider_save_listing` doesn't write them yet; the venue form keeps `details.country_code` and `details.timezone` (PHASE B: extend the RPC). |
| L09 | P3 | Timezones from coordinates. | OPEN | The country default (`defaultTzForCountry`) is used. A coordinate → zone lookup is PHASE B (MapTiler has no tz API; use a tz-boundary dataset). |

## 4. Language readiness (I18N-G)

| ID | Sev | Gap | Status | Where |
|---|---|---|---|---|
| G01 | P2 | `<html lang="en">` | **FIXED** | `src/app/layout.tsx` uses `DEFAULT_LOCALE` (`en-GB`). Email layout and the subscription confirm page are `en-GB`. |
| G02 | P2 | No message catalogue. | **FIXED** (minimal) | `src/lib/i18n/messages.ts`: checkout currency, tax and zone notices, cancellation and legal wording, reverse charge, alcohol, resale, email subjects. A parity test covers every locale. Not everything is extracted (by brief). |
| G03 | P3 | Language preference | Already stored | `profiles.language` (editable in Account, validated by `update_my_profile`). Gala Agent now uses it. |
| G04 | P3 | **RTL audit (notes only).** CSS uses physical properties: `margin-left` ×266, `padding-left` ×153, `left:` ×779, `text-align: left` ×160, `border-left` ×79. Logical properties: `margin-inline` ×10, `padding-inline` ×3, `inset-inline` ×0. No `dir` anywhere. Inline `marginLeft`/`paddingLeft` in 29 TSX places. Icons with direction (`ArrowLeft`/`ArrowRight`, `ChevronRight`) are not mirrored. | OPEN (notes) | Before an RTL language: convert to logical properties (`margin-inline-start`, `inset-inline-start`, `text-align: start`), add `dir` from the locale, and mirror directional icons with `[dir=rtl] .icon-dir { transform: scaleX(-1) }`. Charts and the venue-plan canvas stay LTR. |
| G05 | P3 | Plurals use `n === 1 ? "" : "s"` patterns. | OPEN | `Intl.PluralRules` when a second language lands. |
| G06 | P3 | Number formatting is hard-coded `"en-GB"` (471 places). | Accepted | The UI is en-GB. Revisit with a second locale. |

## 5. Rules per country (I18N-R)

| ID | Sev | Gap | Status | Where |
|---|---|---|---|---|
| R01 | **P0 legal** | **Consumer cancellation info by buyer country** was not shown at checkout. EU CRD art. 16(l) and UK CCR reg. 28(1)(b) exempt dated leisure tickets from the 14-day right, but the exemption must be disclosed before purchase. | **FIXED** (tickets) | `src/lib/i18n/rules.ts cancellationNotice`. Checkout review shows it by **buyer** profile country (UK / EU+EEA / other). Wording is LEGAL REVIEW PENDING in `messages.ts`. PHASE B: marketplace booking checkout (`kind: "booking"` copy exists). |
| R02 | P1 | Age and alcohol rules covered only GB/IE (`bar_jurisdiction_rules`). | **FIXED** (framework and messaging) | `countries.ts alcoholRule` (general minimum for 38 countries, `covered` flag), `rules.ts alcoholNotice`. The compliance section shows "not covered" for other countries. |
| R03 | P1 | **Licence packs**: only `gb-eng-wal` exists. Other countries showed an empty requirements list that looked "compliant". | **FIXED** (framework and flag) | `licencePackCoverage()`. The compliance section shows "No licensing rule pack for {country} yet…". GB is complete (England & Wales); Scotland and NI are flagged when a region is set. The country field hint is updated. Packs stay data (`compliance_rule_packs`). |
| R04 | P2 | Cookie consent variants. | Already strict / documented | The banner is prior opt-in with an equal "Essential only" button, analytics are off until consent, and DNT/GPC are honoured (`api/analytics/capture`). `cookieConsentModel()`: one strictest model everywhere (EU/UK ePrivacy). No change needed. |
| R05 | P1 | Resale price rules by country. | **FIXED** (framework and list) / PARTIAL (enforcement) | `countries.ts resaleRule` (face value: IE, BE, IT, PT, DK, NO, NZ, JP; +10%: AU states; organiser consent: FR; regional: ES, US, CA; no statutory cap: GB, DE, NL; others unknown). `effectiveResaleCapPct()` is applied on the resale page. The DB authority is `resale_policies` per jurisdiction. The platform default of 100% (face value) already satisfies every listed cap. PHASE B: seed `resale_policies` rows per country. |
| R06 | P1 | Tax display: EU and UK consumers must see tax-inclusive prices; the US sees tax on top. | **FIXED** (display) | `consumerPriceDisplay`, `taxDisplayNote` (checkout). `reverseChargeWording` (EU art. 196 / UK HMRC / other) is ready for quotes and invoices. **tax_id_collection, commission VAT and fee VAT belong to Q74** (`fee_vat_treatment`, `trg_checkout_order_vat`, in migration `202611147401`), so they are not duplicated here. |
| R07 | P2 | Create-event "Tax treatment" offers only UK VAT rates. | OPEN | Use `ref_countries.tax_options` for the workspace country (the data exists for 38 countries). |
| R08 | P2 | Data-transfer rules (UK/EU adequacy, SCCs), DSA/P2B, the GDPR Art 27 representative | HANDOFF (Q74 legal text; D2 defers the representative) | No code change. Legal texts must not mention a representative (D2). |
| R09 | P2 | US sales tax exposure and CA GST/HST | OPEN, owner decision O4 | Stripe Tax monitors nexus. Q74's registration readiness. |

## 6. Agent (I18N-A)

| ID | Sev | Gap | Status | Where |
|---|---|---|---|---|
| A01 | P2 | Gala Agent prompts used the UTC date and had no language or zone rule. | **FIXED** | `src/lib/agent/locale.ts localeDirective`: today in the zone, times in the event's or workspace's zone, reply in `profiles.language`, never add across currencies. Used in `app/api/agent/ask/route.ts` and `lib/agent/runtime.ts` planner (Azure via `llm.ts`; prompts only; no customer-workspace AI). |
| A02 | P2 | Agent event context had no time or zone. | **FIXED** | `lib/agent/context.ts` (date, time, zone abbreviation, IANA zone). |

## 7. Data (I18N-D)

| ID | Sev | Gap | Status | Where |
|---|---|---|---|---|
| D01 | P1 | Missing columns: `events.country`, `listings.currency`/`country`/`timezone`, `profiles.timezone`. | **FIXED** | Migration `202611147251` (additive, nullable, checked, backfilled: London events → GB, else the workspace country; listings → GBP plus the workspace country or GB). |
| D02 | P1 | Master data covered 13 countries, 7 currencies and 18 zones. | **FIXED** | 38 countries (all 36 Connect seller countries + AE/ZA), 19 currencies, 54 zones; `ref_countries.region` gains `europe`. DB = catalog (`tests/foundation/master-data.spec.ts`). |
| D03 | P2 | `src/types/database.ts` was not regenerated (other lanes' migrations are live too). | OPEN | New columns are read via `untyped()`. Regenerate in the release pass. |
| D04 | P2 | `workspace_default_currency()` and `event_checkout_currency()` are service-only helpers (not swept as tenant data). | Done | |

## 8. Area sweep (where each area stands)

| Area | State after Q72 | Remaining |
|---|---|---|
| **Wizards** | Create-event zone and currency, RFQ respond-by, proposals, invoices, venue address/postcode/phone, service radius unit | Ticket-pro zone and currency (C09, T08), onboarding address form (L06), tax options (R07) |
| **Management / admin** | `totalsByCurrency` helper | Admin commerce per-currency totals (C12, Q75), admin pages in London (T13) |
| **Customers** | Event, checkout, tickets and confirmation in the event zone and currency; local-time hint; cancellation notice; E.164 phone | Customer-owned events (`customer/event-header.tsx`), booking-flow `£` (C10) |
| **Builds (event builder / maps)** | Venue geocoding worldwide | Plan editor search already worldwide; tz from coordinates (L09) |
| **AI agent** | Language, zone and currency directive | Routines in workspace zone (T10) |
| **Data** | Columns, backfill, triggers, master data | Types regeneration (D03) |
| **Functions (RPCs)** | `checkout_quote` currency, order currency guard, quote currency, listing/event defaults, Connect currency default | Payment order currency source (C05/O2), SQL notification formatting (T09/C11), business days per country (T07), resale currency (C15) |
| **Suppliers / marketplace / venues** | Coverage worldwide, km/mi, venue country rules, quotes in the charged currency | Listing price currency on public pages (C08), provider calendars zone (T11) |
| **Tickets** | Checkout currency (P0 fixed), event-zone times, resale legal cap | Fee schedule per currency (C14), ticket-pro editor (C09) |
| **Locations** | Geocode helper, postcode/address/phone helpers | Adaptive address forms, tz from coordinates |

## 9. Owner decisions needed

| # | Decision | Recommendation |
|---|---|---|
| O1 | UI languages beyond en-GB? | No switcher for launch (Gigvora alignment). Agent replies in the preference. Revisit when a market needs it. |
| O2 | Marketplace bookings: charge in the **event** currency (today) or the **seller's** listing/Connect currency? | Seller's currency (no seller FX; matches listing prices). Payments lane builds it. Quotes already store the charged currency. |
| O3 | Fee schedule per currency (fixed booking fee, plan prices) | One catalogue per currency, rounded locally (£0.49 / €0.59 / US$0.59 …), as Gigvora §12.6. |
| O4 | US/CA launch timing (sales tax nexus, state resale laws) | Allow sellers (Connect supports them). Keep US consumer checkout tax-exclusive with Stripe Tax monitoring before volume. |
| O5 | JPY and HUF checkout | Defer until the SQL quote handles minor digits. Japanese and Hungarian sellers can price in USD/EUR meanwhile. |
| O6 | Public holiday calendars per country for release dates | Weekdays-only outside the UK for launch (T07 rule). Load calendars for the top seller countries later. |
| O7 | Licence and alcohol packs for IE, FR, DE, NL, ES first? | Yes, by seller volume. Each pack needs counsel review. |

---

## 10. Q76 phase 2 (lane i18n-phase2, 2026-11-14)

Coordinator decisions applied: no language switcher (en-GB); bookings charge in the SELLER's currency (O2); one fee catalogue per
currency, rounded locally (O3); US/CA sellers allowed, Stripe Tax monitors (O4); JPY/HUF checkout deferred (O5); non-UK release dates
count weekdays only, the UK keeps `uk_bank_holidays` (O6); licence/alcohol packs stay framework-only (IE/FR/DE/NL/ES queued for counsel).

Migrations (all applied to live and verified, additive, manifest-reviewed, exercises in `scripts/db/exercises/`):
`202611147651_q76_i18n_money_paths`, `202611147652_q76_i18n_notification_formats`, `202611147653_q76_i18n_listings_resale`,
`202611147654_q76_listing_timezone_invoker`, `202611147655_q76_fee_catalogue_server_only`. Prior bodies of every replaced function:
`docs/release/i18n/q76-rollback.sql`. Tests: `tests/release/q76-i18n-phase2.spec.ts`.

| ID | Status after Q76 | Where |
|---|---|---|
| C13 payout settlement currency | **FIXED** | `releases-core.ts settlementNet` (charge net × the charge's own balance-transaction rate, floored, ≤ bt.net); `planReleaseGroups` groups and pays in the settlement currency; `merchant.charge` expands `latest_charge.balance_transaction`; `dec107_release_paid` records `payout_releases.settlement_currency` and creates the reserve part in it. |
| C05 / O2 booking currency | **FIXED** | `booking_charge_currency(item)` = existing order → latest quote → listing → seller workspace → event → GBP; used by `create_payment_order`, `i18n_quote_currency`, `customer_accept_quote`; UI: booking checkout, lifecycle panel, disputes, emergency quotes. |
| C14 / O3 fee catalogue | **FIXED** | `ref_fee_catalogue` (15 currencies, `reviewed = false` until the owner confirms the price points) + `fee_fixed_minor_in`; `checkout_quote` fixed ticket fee and `booking_admin_fee_minor(amount, currency)`. TS mirror `money.ts FEE_CATALOGUE / localFixedFeeMinor`, `fees.ts bookingAdminMinimum`. |
| C15 resale currency | **FIXED** | The three GBP-only checks now require the original order to be in the event's checkout currency. |
| T07 release dates | **FIXED** | `dec107_add_business_days_in(from, days, tz, country)` + `dec107_ticket_release_at(event)` in the sweep and `ticket_sales_open_from` (UK results identical: exercise compares every start over a holiday/DST span). |
| C11 / T09 SQL bodies | **FIXED** (transactional) | `fmt_money`, `fmt_money_minor`, `fmt_event_time`, `fmt_tz_abbrev`, `local_tz`, `dispute_currency`; 19 bodies rewritten. GBP-by-rule bodies unchanged: `trust_reason_text` (UK insurance minimums), `dispute_route` (£5,000 consumer arbitration floor), ad products, `admin_request_money` (Q75). SQL uses a plain space after a currency code; Intl uses a no-break space. |
| C08/C09/C10 hard-coded £ | **FIXED** on the Q76 list | ticket-pro (currency + zone threaded: `tpLocale`), ticket-setup (zone inputs), booking flow, lifecycle/dispute/emergency, RFQ budget, public listing (+ JSON-LD), rate cards, menus/bar packages, venue/service/package/booking wizards, invoice wizard symbol. |
| T08 sale windows | **FIXED** | ticket-pro and ticket-setup edit and show sale windows in the event's zone. |
| T10 routines | **FIXED** | `schedule.ts nextRunAt(…, { tz })`, `schedule-db.ts workspaceTimezone`; saveRoutine evaluates in the workspace zone. |
| T11 provider calendars | **FIXED** | `public_listing_availability` / `listing_availability_local` use `listing_timezone()`; provider statements use the workspace's months (`london-month.ts` takes a zone). |
| L05/L06 forms | **FIXED** (onboarding venue, tax details) | Country postcode label/validation (`checkPostcode`), region field when the country uses one. |
| L07 phones | **FIXED** | `optionalPhone` → E.164 for organiser workspace contact, organiser team, provider team, provider workspace profile. |
| L08 listing locale | **FIXED** | `provider_save_listing` writes `country/timezone/currency` (validated); the venue wizard's currency select is live. |
| R01 bookings | **FIXED** | Booking checkout shows the buyer-country cancellation notice (`kind: "booking"`). |
| R05 resale policies | **PARTIAL** | Published v1 policies for IE, BE, IT, FR at 100% of face value (sourced in `countries.ts`; text marked "(verify)", `needs_review`); `resale_policy_for` falls back event jurisdiction → event country (when a policy exists) → GB. DK, PT, NO, AU, NZ, JP have no source URL yet. |
| R07 tax options | **FIXED** | Create-event tax options from `COUNTRIES.tax` (= `ref_countries.tax_options`) for the workspace country. |
| G04 RTL | **PARTIAL** | Logical-property swaps (no visual change in LTR) in `src/app/globals.css`, `src/styles/kit.css`, `src/styles/workspace.css`, `src/styles/portal-shell.css`. Other stylesheets, inline styles, radii and icon mirroring remain. |
