# Q72 country launch matrix

Lane i18n, 2026-11-14. This says, for each country, what works **today** after Q72. It is generated from `src/lib/i18n/countries.ts`,
`src/lib/payments/connect-countries.ts` and master data, and checked against the Connect list by `tests/release/q72-i18n.spec.ts`.
The legal columns are reference positions awaiting counsel (D14), not advice.

**Status levels:**

| Status | Meaning |
|---|---|
| **Full** | Sell and buy on-platform, local-currency checkout, buyer notices, a reviewed licence pack, alcohol rules covered |
| **Partial** | Sell and buy work, but one or more of these is missing: licence pack, alcohol rules, local-currency checkout, reviewed legal positions |
| **Partial (buy only)** | Buyers can buy; sellers there are enquiry-only because Stripe Connect can't take direct charges for them |
| **Not supported** | Blocked: comprehensively sanctioned places (Q74 list) |

**The same for every country:**

| Topic | Position |
|---|---|
| Language | English UI (`lang="en-GB"`), no switcher (Gigvora alignment). Gala Agent replies in the user's language preference (`profiles.language`). |
| Time | Events store and show their own zone, with a viewer-local hint. |
| Cookies | One strict prior-opt-in model everywhere. GPC and DNT are honoured. |
| Data protection | UK GDPR base. EU users are covered by EU GDPR. The Art 27 representative is deferred (D2), and legal texts don't mention one. |
| Maps | MapTiler geocoding worldwide (Nominatim fallback). |
| Phone | Phones are stored in E.164. |

## Summary

| Status | Countries | Count |
|---|---|---|
| **Full** | GB | 1 |
| **Partial** (sell + buy, local checkout) | AT, AU, BE, BG, CA, CH, CY, CZ, DE, DK, EE, ES, FI, FR, GR, HK, IE, IT, LT, LU, LV, MT, NL, NO, NZ, PL, PT, RO, SE, SG, SI, SK, US | 33 |
| **Partial** (sell + buy, no local-currency checkout) | HU (HUF), JP (JPY): sellers price in EUR/USD/GBP until the quote handles their minor units (O5) | 2 |
| **Partial (buy only)** | AE, ZA (onboarding countries). BR, MY (no application fees). IN, TH (contact sales). MX (review). ID, HR, GI, LI (preview). NG, KE, GH, CI (not Stripe). Every other non-sanctioned country. | — |
| **Not supported** | Cuba, Iran, North Korea, Syria, Russia, Belarus, Crimea, Sevastopol, non-government-controlled Donetsk and Luhansk (Q74 `sanctioned_jurisdictions`) | 10 |

What moves a **Partial** country to **Full**:

1. A licence/compliance rule pack, reviewed by counsel (O7).
2. Alcohol rules rows for the country.
3. Legal positions reviewed (consumer notice wording, resale cap).
4. For HU and JP: local-currency checkout.
5. For US and CA: the sales tax decision (O4).

## Per country

Column notes:

| Column | Meaning |
|---|---|
| Selling | Stripe Connect DEC-107 (direct charges, no-dashboard accounts, manual payouts) |
| Buying | Card checkout through Stripe (buyers in any non-sanctioned country) |
| Tax | Gala Dock's fee VAT and tax registration belong to Q74 |
| Consumer law | The cancellation notice shown at checkout by the buyer's country |
| Licence pack | `compliance_rule_packs` |
| Alcohol · resale | General minimum age (covered = Gala Dock rule rows exist) · resale price rule |

| Code | Country | Status | Selling (Connect) | Buying | Tax | Consumer law | Language | Currency | Maps / geocoding | Licence pack | Alcohol · resale |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GB | United Kingdom | **Full** | Yes (Connect direct charges) | Yes | UK VAT (fees: Q74); consumer prices incl. VAT | UK CCR: reg. 28 ticket notice shown | en-GB UI; agent in preference | GBP (checkout) | Yes (MapTiler; postcode check) | Complete (England & Wales); Scotland/NI flagged | 18+ (covered) · no statutory cap |
| AE | United Arab Emirates | **Partial** (buy only) | No: enquiry-only (contact_sales) | Yes | VAT B2C digital rules (adviser); incl. tax shown | Generic notice | en-GB UI; agent in preference | AED display only; price in EUR/USD/GBP | Yes (MapTiler; no postcode) | None: flagged in Compliance | 21+ (not covered) · not reviewed |
| AT | Austria | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 16+ (not covered) · not reviewed |
| AU | Australia | **Partial** | Yes (Connect direct charges) | Yes | GST B2C digital rules (adviser); incl. tax shown | ACL guarantees; generic notice | en-GB UI; agent in preference | AUD (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · face value +10% |
| BE | Belgium | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 16+ (not covered) · face value |
| BG | Bulgaria | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| CA | Canada | **Partial** | Yes (Connect direct charges) | Yes | GST/HST (O4); prices shown excl. tax | Provincial; generic notice | en-GB UI; agent in preference | CAD (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 19+ (not covered) · varies by region |
| CH | Switzerland | **Partial** | Yes (Connect direct charges) | Yes | Local VAT thresholds (adviser); incl. VAT shown | No statutory withdrawal right; generic notice | en-GB UI; agent in preference | CHF (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 16+ (not covered) · not reviewed |
| CY | Cyprus | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 17+ (not covered) · not reviewed |
| CZ | Czech Republic | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | CZK (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| DE | Germany | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 16+ (not covered) · no statutory cap |
| DK | Denmark | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | DKK (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · face value |
| EE | Estonia | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| ES | Spain | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · varies by region |
| FI | Finland | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| FR | France | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · organiser consent |
| GR | Greece | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| HK | Hong Kong | **Partial** | Yes (Connect direct charges) | Yes | Tax B2C digital rules (adviser); incl. tax shown | TDO; generic notice | en-GB UI; agent in preference | HKD (checkout) | Yes (MapTiler; no postcode) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| HU | Hungary | **Partial** (no local-currency checkout) | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | HUF display only; price in EUR/USD/GBP | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| IE | Ireland | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (covered) · face value |
| IT | Italy | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · face value |
| JP | Japan | **Partial** (no local-currency checkout) | Yes (Connect direct charges) | Yes | Consumption tax B2C digital rules (adviser); incl. tax shown | SCTL; generic notice | en-GB UI; agent in preference | JPY display only; price in EUR/USD/GBP | Yes (MapTiler; postcode check) | None: flagged in Compliance | 20+ (not covered) · face value |
| LT | Lithuania | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 20+ (not covered) · not reviewed |
| LU | Luxembourg | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 16+ (not covered) · not reviewed |
| LV | Latvia | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| MT | Malta | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 17+ (not covered) · not reviewed |
| NL | Netherlands | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · no statutory cap |
| NO | Norway | **Partial** | Yes (Connect direct charges) | Yes | Local VAT thresholds (adviser); incl. VAT shown | Angrerettloven: EU-style notice shown | en-GB UI; agent in preference | NOK (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · face value |
| NZ | New Zealand | **Partial** | Yes (Connect direct charges) | Yes | GST B2C digital rules (adviser); incl. tax shown | CGA; generic notice | en-GB UI; agent in preference | NZD (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · face value |
| PL | Poland | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | PLN (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| PT | Portugal | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · face value |
| RO | Romania | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | RON (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| SE | Sweden | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | SEK (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| SG | Singapore | **Partial** | Yes (Connect direct charges) | Yes | GST B2C digital rules (adviser); incl. tax shown | CPFTA; generic notice | en-GB UI; agent in preference | SGD (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| SI | Slovenia | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| SK | Slovakia | **Partial** | Yes (Connect direct charges) | Yes | EU VAT via non-Union OSS (IE, Q74); B2B reverse charge; incl. VAT shown | EU CRD: art. 16(l) ticket notice shown | en-GB UI; agent in preference | EUR (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |
| US | United States | **Partial** | Yes (Connect direct charges) | Yes | Sales tax exposure (O4); prices shown excl. tax | State law; generic notice | en-GB UI; agent in preference | USD (checkout) | Yes (MapTiler; postcode check) | None: flagged in Compliance | 21+ (not covered) · varies by region |
| ZA | South Africa | **Partial** (buy only) | No: enquiry-only (not_stripe) | Yes | VAT B2C digital rules (adviser); incl. tax shown | Generic notice | en-GB UI; agent in preference | ZAR display only; price in EUR/USD/GBP | Yes (MapTiler; postcode check) | None: flagged in Compliance | 18+ (not covered) · not reviewed |

### Countries without a profile row

| Group | Selling | Buying | Notes |
|---|---|---|---|
| BR, MY | No (Stripe: platforms outside the country can't take application fees) | Yes | Listings are kept enquiry-only by the DB trigger (`enforce_seller_country_booking_mode`) |
| IN, TH, AE | No (contact Stripe sales) | Yes | AE has a profile (above) because it is an onboarding country |
| MX | No (Stripe review needed) | Yes | |
| ID, HR, GI, LI | No (Connect preview) | Yes | HR is EU: EU CRD notice, OSS VAT. Add a profile when Connect opens. |
| NG, KE, GH, CI, ZA | No (Paystack network, not Stripe) | Yes | ZA has a profile (above) |
| Rest of world (not sanctioned) | No | Yes | Generic consumer notice, GBP/EUR/USD checkout in the event currency, en-GB UI, km units |
| Sanctioned (Q74) | No | No | Refused at sign-up, listing, publish, partner application and payout (Q74) |

## Where the facts live

| Fact | Source of truth |
|---|---|
| Seller payout countries | `src/lib/payments/connect-countries.ts` + `public.connect_supported_countries` |
| Countries, currencies, zones | `src/lib/master-data/catalog.ts` + `ref_countries` / `ref_currencies` / `ref_timezones` (migration `202611147251`) |
| Consumer law, alcohol, resale, postcode, address, phone, units, tax display | `src/lib/i18n/countries.ts`, `src/lib/i18n/rules.ts` |
| Notice wording | `src/lib/i18n/messages.ts` (LEGAL REVIEW PENDING) |
| Sanctions | `src/lib/legal/sanctions.ts` + `public.sanctioned_jurisdictions` (Q74) |
| Licence packs | `public.compliance_rule_packs` / `compliance_rules` (data) |
| Resale policy (enforced) | `public.resale_policies` per jurisdiction. `effectiveResaleCapPct` never shows more than the legal cap. |
