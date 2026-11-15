# Gala Dock: Localisation and translation requirements

Owner requirement, 15 November 2026. Status: **required before Gala Dock launches in any non-English market.**

> **When to translate (owner rule): translate a language ONLY when we are actively emailing that country, or when customers from that country come to us** (sign-ups, demo requests, enquiries or support tickets in that language). Until then, build the i18n *foundation* (keys, fallback to English, formatting) so adding a language later is cheap, but don't pay for or produce translations speculatively. When a trigger fires for a country, its language moves to the front of the queue in section 9, and its support pack (section 9) is prepared before any marketing in that language starts.

Gala Dock must be **fully translated and localised into 12 languages**. Every piece of user-facing text is in scope: no hard-coded English anywhere a customer, admin, invitee or email recipient can see it. Wording must be **professional, native-quality and consistent**, not raw machine translation.

Markets come from the Blackwellen market rule (Stripe-supported **and** B2B email allowed without opt-in). See the lead-generation programme's `docs/01-compliance/international-markets.md`.

---

## 1. Languages (12)

| # | Language | Locale code | Countries / users | Script / direction |
|---|---|---|---|---|
| 1 | English (UK), the **source language** | `en-GB` | UK, Ireland, Singapore, default fallback | Latin, LTR |
| 2 | English (US) | `en-US` | USA (US spelling, dates, currency) | Latin, LTR |
| 3 | French | `fr-FR` | France, Belgium (Wallonia/Brussels), Luxembourg | Latin, LTR |
| 4 | Dutch | `nl-NL` | Netherlands, Belgium (Flanders) | Latin, LTR |
| 5 | German | `de-DE` | Luxembourg, Belgium (German-speaking) | Latin, LTR |
| 6 | Swedish | `sv-SE` | Sweden, Finland (second official language) | Latin, LTR |
| 7 | Finnish | `fi-FI` | Finland | Latin, LTR |
| 8 | Norwegian (Bokmål) | `nb-NO` | Norway | Latin, LTR |
| 9 | Portuguese (European) | `pt-PT` (**not** pt-BR) | Portugal | Latin, LTR |
| 10 | Japanese | `ja-JP` | Japan | CJK, LTR |
| 11 | Chinese (Traditional, Hong Kong) | `zh-HK` (**not** Simplified) | Hong Kong | CJK, LTR |
| 12 | Estonian | `et-EE` | Estonia | Latin, LTR |
| + | **Arabic** | `ar` | Arabic-speaking users (owner request, "if possible without breaking the site") | Arabic, **RTL** (see section 6) |

English is written once in `en-GB`, and `en-US` overrides only spelling and format differences (colour/color, organisation/organization, date order).

## 1a. Non-negotiable rule: English by default, and never a raw key

**The default language is always English (`en-GB`).** A new visitor, a new account, a new workspace and any email without a known recipient language all start in English. Another language is used only when the user chooses it or their saved preference, workspace setting or country says so.

**A translation key must never appear on screen or in an email.** No user may ever see `dashboard.title`, `settings.billing.cta`, `{count}`, `[missing: …]` or an empty button.

1. **Fallback chain for every message:** requested locale → its base (e.g. `nl-BE` → `nl-NL`, `en-US` → `en-GB`) → **`en-GB`**. If a key is missing or empty in a locale, the English text is shown, never the key.
2. **`en-GB` is complete by definition.** A build fails if any key used in the code is missing or empty in `en-GB`.
3. **Runtime guard:** the i18n layer's missing-message handler (e.g. `getMessageFallback` / `onError` in next-intl) returns the English string and logs the missing key with its locale to monitoring. It never renders the key. If even English is missing (which should be impossible), show a neutral generic label for that component type, not the key.
4. **Placeholder safety:** every translation must keep exactly the same ICU placeholders as English (`{name}`, `{count, plural, …}`). CI rejects a translation with missing, extra or renamed placeholders, and at runtime a malformed message falls back to English instead of crashing or showing raw braces.
5. **Emails:** a template missing in the recipient's language is sent in English. A missing string inside a localised template falls back to its English string. A rendered email is checked before sending for leftover `{…}` or key-like tokens, and is blocked and alerted if any are found.
6. **Keys are stable:** renaming or deleting a key needs every locale updated in the same change. CI checks that every locale has the same key set as `en-GB` (missing keys are reported as warnings and fall back to English; keys that exist only in a translation are removed).
7. **Tests:** automated tests render every main page in every locale plus pseudo-locale and fail if any visible text matches a key pattern (`^[a-z0-9_]+(\.[a-z0-9_]+)+$`) or contains unreplaced `{`/`}`. Email templates get the same tests.

## 2. Scope: everything must be translated

Nothing user-facing is excluded. Every item below must use translation keys, never inline literals.

**Public site**
- Header, navigation, mega-menus, footer, cookie banner and consent dialog
- Home, features, solutions, pricing, about, contact, careers, blog/listing pages, case studies, comparison pages
- Search box, search results, empty/no-results states
- Filters, dropdowns, sort options, chips, tags, pagination, "load more"
- Forms: labels, placeholders, helper text, validation messages, success/error toasts
- Help centre and knowledge base: categories, articles, search, "was this helpful", contact support
- **Legal pages:** terms, privacy policy, cookie policy, acceptable use, DPA/sub-processors, refund/cancellation, affiliate/marketplace terms (see section 5)
- SEO: page titles, meta descriptions, Open Graph text, alt text, structured data names, the 404/500 pages

**Auth and onboarding**
- Sign in, sign up / registration, account-type selection, password reset, magic links, email verification, MFA/OTP screens, session expired, account recovery
- Onboarding wizards and every step: titles, descriptions, buttons (Back/Next/Skip/Finish), progress labels, validation, success states
- **Invitation pages:** accept invite, join workspace, expired/invalid invite
- Product tours, tooltips, coach marks, checklists, "what's new" panels, in-app instructions

**App (every workspace)**
- Dashboards: KPI cards, chart titles, axis labels, legends, tooltips, empty states, date-range pickers
- Every section and page, list views, tables (column headers, row actions, bulk actions), card views, kanban/board/calendar/timeline/map views
- Detail pages: tabs, sub-tabs, right-rail panels, activity feeds, comments, notes, timelines
- Create/edit forms and wizards, confirmation dialogs, dangerous-action warnings, modals, drawers, sheets
- Buttons, icon-button labels (aria-labels too), menus, context menus, command palette, keyboard-shortcut help
- Status badges, enums and every value shown from the database (statuses, types, stages): map them to keys, **never show raw enum values**
- **Notifications:** bell/notification centre, toasts, banners, in-app messages, push and SMS text
- **Settings:** profile page, account, workspace, team/roles, permissions, billing, plans, integrations, API/webhooks, notification preferences, security, data and privacy
- Messages and chat UI, AI assistant UI text and system prompts that produce user-visible text (the AI must reply in the user's language)
- Uploads, file previews, export/import wizards and their errors
- Error states, offline/maintenance banners, rate-limit messages, permission-denied/locked states

**Admin area**
- Every admin page, register, detail page, audit log labels, feature flags, support tools, system health, usage and billing admin. Admins may be non-English speakers too.

**Checkout and billing**
- Pricing tables, plan names and descriptions, checkout pages, Stripe Checkout / Payment Element locale (pass `locale`), invoices, receipts, tax/VAT wording, payment failure and dunning messages, cancellation and refund flows

**Emails (by recipient's country)**
- Every transactional email: welcome, verification, password reset, invite, receipts/invoices, trial reminders, billing failure, notifications digest, security alerts
- Every marketing/outreach email template and its unsubscribe page
- Choose the language from the **recipient's** saved preference, otherwise their country (table in section 4), otherwise `en-GB`. Never from the sender's language.
- Each template has a localised subject, preheader, body, buttons, footer, legal address and unsubscribe text.

## 3. Technical requirements

1. **Library:** a Next.js-native i18n layer, e.g. `next-intl` (App Router, server components, ICU MessageFormat). One message catalogue per locale: `messages/<locale>.json`, namespaced by area (`auth`, `dashboard`, `settings`, `admin`, `email`, `legal`).
2. **Routing:** locale-prefixed public URLs (`/fr/pricing`, `/ja/…`), with `en-GB` as the default. The app uses the user's saved locale, with no URL prefix needed inside the app. Add a language switcher in the header, footer and profile settings.
3. **Detection order:** saved user preference → workspace default → `Accept-Language` → country from IP (only as a hint) → `en-GB`. Always let the user change it, and remember the choice.
4. **ICU messages:** plurals, gender/select and number/date/currency arguments. No string concatenation to build sentences.
5. **Formatting via `Intl`:** dates and times (local order, 24-hour where usual), numbers, **currencies** (GBP, USD, EUR, SEK, NOK, JPY, SGD, HKD, plus AED for Arabic markets if sold), phone numbers (E.164 stored, formatted per locale), addresses (country-specific formats), first/last name order (Japanese: family name first).
6. **Layout:** allow 30–40% text expansion (German, Finnish and Dutch run long), so there are no fixed-width buttons. CJK needs suitable fonts (Noto Sans JP / Noto Sans TC) and line-breaking rules.
7. **SEO:** `hreflang` for every locale and `x-default`, localised sitemaps, canonical URLs per locale, and translated metadata.
8. **Database content:** user-generated content isn't translated, but system-seeded content (templates, categories, plan names, help articles) needs translation fields or per-locale rows.
9. **Accessibility:** a `lang` attribute on `<html>` per locale, translated aria-labels, screen-reader text and alt text.
10. **CI checks:** fail the build on missing keys in any locale, unused keys, or hard-coded user-facing strings (lint rule). Pseudo-localisation mode (`xx-XX`, accented and lengthened text) to find untranslated and clipped UI.

## 4. Recipient country → email language

| Country | Language | | Country | Language |
|---|---|---|---|---|
| UK, Ireland | en-GB | | Sweden | sv-SE |
| USA | en-US | | Finland | fi-FI (sv-SE if the contact prefers it) |
| Singapore | en-GB | | Norway | nb-NO |
| France, Luxembourg | fr-FR | | Portugal | pt-PT |
| Belgium | fr-FR or nl-NL by region/postcode (Flanders nl, Wallonia fr, Brussels fr); de-DE for the German-speaking community | | Japan | ja-JP |
| Netherlands | nl-NL | | Hong Kong | zh-HK (en-GB if the contact prefers it) |
| Estonia | et-EE | | Arabic-speaking contacts | ar |

Per-country legal elements inside localised emails: Singapore subjects carry the `<ADV>` label on marketing emails; every marketing email has a working one-click unsubscribe in the recipient's language, the sender's identity and a postal address.

## 5. Legal pages

- Legal pages must be **professionally translated and reviewed**, not machine-only. French and Belgian consumer/contract law expects French-language terms. Always keep the governing-language clause ("the English version prevails" only where that's lawful).
- Privacy notices must meet GDPR transparency in the reader's language (EU/EEA markets) and local law (Japan APPI, Hong Kong PDPO, Singapore PDPA).
- Date-stamp each translation and re-translate whenever the English source changes (track a version per locale).

## 6. Arabic (RTL): how to add it without breaking the site

Arabic is allowed only if it's built so that left-to-right layouts don't break:

- Set `dir="rtl"` and `lang="ar"` on `<html>` for the Arabic locale only.
- Use **CSS logical properties** everywhere (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`), and in Tailwind the `ms-*/me-*/ps-*/pe-*/start-*/end-*` utilities instead of `ml/mr/pl/pr/left/right`.
- Mirror directional icons (arrows, chevrons, back buttons, progress steppers) but **not** logos, media controls, charts' numeric axes or brand marks.
- Charts and tables: keep numbers LTR inside RTL text (`<bdi>` / `unicode-bidi: isolate`). Phone numbers, emails, URLs and codes always render LTR.
- Fonts: an Arabic-capable font (e.g. Noto Sans Arabic / IBM Plex Sans Arabic), with checked line height.
- Ship it behind a feature flag. Visual-regression screenshots in RTL for every main page, plus a pseudo-RTL test mode, before release.

## 7. Wording and quality standard

- **Tone:** professional, warm, concise and on-brand. Use the formal register where business norms expect it: French *vous*, German *Sie*, Dutch *u* in legal/billing and *je* only if the brand guide says so, Japanese polite form (*desu/masu*, *keigo* in billing/legal), Portuguese formal, Swedish, Finnish and Norwegian neutral-professional.
- **Glossary:** product and brand names are never translated (Gala Dock, plan names if trademarked). Keep a per-language glossary of core terms (workspace, pipeline, lead, invoice, booking, etc.) and use it consistently.
- **Process:** source strings in `en-GB` with translator context notes (where they appear, character limits, placeholders) → machine pre-translation → **native professional review for every language**, mandatory for ja-JP, zh-HK, ar and all legal pages → in-context review on screenshots → sign-off per locale.
- **Never** ship mixed-language screens, untranslated placeholders (`{count}`), truncated text, or raw keys (`dashboard.title`).

## 8. Definition of done (per locale)

- [ ] 0 missing keys; the CI hard-coded-string check passes
- [ ] No raw key or `{placeholder}` appears anywhere (key-pattern render test passes); missing strings fall back to English
- [ ] A new visitor, account and workspace start in English
- [ ] Every page in section 2 reviewed in context (desktop, tablet, mobile)
- [ ] Every email template sent as a test in that locale and reviewed
- [ ] Checkout completes in that locale (Stripe locale set), with correct currency, tax wording and invoice language
- [ ] Legal pages translated, reviewed, dated and versioned
- [ ] Dates, numbers, currency, phone and address formats correct
- [ ] Pseudo-localisation shows no clipping; Arabic also passes RTL screenshots
- [ ] Language switcher and saved preference work; `hreflang` and sitemaps updated
- [ ] Native reviewer sign-off recorded (name, date)

## 9. Support impact and the priority order (simple version)

Every language we switch on is a language customers will write to support in. So a language goes live **only when support can handle it**, and the rollout is deliberately staged.

**Support model (keeps support manageable):**
- Support works in **English**. Inbound tickets and chats in any language are machine-translated into English for the agent, and the agent's English reply is translated back into the customer's language. The original text is kept on the ticket.
- The **help centre is translated first** for each language, so most questions are answered by self-service before they reach a person.
- Canned replies, macros and support email templates are translated with the language, so agents never improvise wording.
- Sensitive topics are **always escalated to a human with native-quality review** before replying: billing disputes, refunds, legal, data-protection requests and complaints.
- The support page shows honest expectations per language ("We reply in your language; replies may be translated").
- A language is paused (UI stays translated, marketing stops) if its ticket volume or quality goes beyond what support can handle.

**Priority order:**

| Priority | Languages | Why | Support needed before go-live |
|---|---|---|---|
| **P1, now** | English (UK), English (US) | Live markets | Already in place |
| **P2, next** | French, Dutch | Biggest new markets (FR, NL, BE, LU) | Translated help centre and macros; machine-translated ticket flow |
| **P3** | Swedish, Finnish, Norwegian | Nordic businesses mostly accept English support | Translated help centre; English support acceptable |
| **P4** | Portuguese (pt-PT) | Smaller market | Translated help centre and macros |
| **P5** | Japanese, Chinese (Traditional, HK) | High-value but high-expectation markets; poor wording loses trust | Native-reviewed help centre and macros; native reviewer on call for escalations |
| **P6** | German, Estonian | Small extra reach (LU/BE German, Estonia); English often accepted | Translated help centre |
| **P7, last** | Arabic (RTL) | Needs RTL engineering and QA; no core market yet | Native reviewer; RTL support screenshots in the help centre |

Rule of thumb: **don't market in a country until its P-level language and its support pack are both live.** The P order above is the default; the real trigger is demand. A language is only translated once we are actively emailing its country or customers from there arrive (see the rule at the top), and then it jumps the queue.

## 10. Rollout order (engineering)

Follows the priority table above: P2 French and Dutch first, then P3, P4, P5, P6, and Arabic last behind a feature flag after RTL QA.
