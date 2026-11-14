# Tax and platform reporting (Q54, 2026-11-14)

> **AI review, not tax or legal advice.** A chartered tax adviser must confirm every conclusion before go-live. Statutory references are given so the adviser can check them quickly; items marked **(verify)** depend on a detail this review could not confirm.

## 1. Summary

| # | Issue | Exposure | Rating | Action |
|---|---|---|---|---|
| T1 | Who supplies the buyer's booking fee / admin fee under direct charges | Double VAT, or VAT on the wrong person, or HMRC treating the fee as part of the organiser's ticket price | **High** | Decide and document the "disclosed collection agent" model (§2) |
| T2 | Agent acting in own name (VATA s.47(3)) | HMRC treats Gala Dock as buying and reselling tickets/bookings → output VAT on full ticket value | **High** | Remove "Gala Dock sells tickets on the organiser's behalf" wording (§2.3) |
| T3 | UK VAT added to all seller commission regardless of seller country | Overcharging non-UK business sellers (they can't recover UK VAT); wrong VAT returns | **High** | Place-of-supply logic in `trg_checkout_order_vat` (§3.1) |
| T4 | Booking/admin fees on events or venues outside the UK | B2C intermediary place of supply is where the underlying supply is (event location/land) → EU VAT due; non-Union OSS | **High** | §3.2 |
| T5 | UK platform reporting (PORR 2023) not built | Penalties; mandatory payout withholding for non-compliant sellers | **High** | §5 |
| T6 | EU DAC7 for EU-resident sellers / EU venues | Registration and reporting in one EU member state unless the UK is a qualified non-Union jurisdiction (verify) | **Med–High** | §5.6 |
| T7 | Merch: online marketplace deemed supplier (VATA s.5A) and joint and several liability (s.77B) | Gala Dock liable for VAT on goods sold by overseas sellers to UK consumers | **Med** | Block overseas sellers from merch or build deemed-supplier accounting (§4) |
| T8 | Partner self-billing compliance | Invalid VAT invoices → partner VAT reclaim/inaccurate output tax | **Med** | Self-billing agreement, sequential numbering, statutory wording (§6) |
| T9 | VAT on Gala Dock plans behind a flag (`BILLING_AUTOMATIC_TAX` unset) | VAT due on UK supplies whether or not charged (output tax = 1/6 of the price if VAT-inclusive pricing assumed) | **Med** | Set the flag before live; Stripe Tax registrations checked in live (cross-brand §4) |
| T10 | Overseas B2C sales of plans/credits (electronically supplied services) | Local VAT/GST registration (EU OSS, Norway, Switzerland, Australia etc.) | **Med** | Cross-brand §4 approach (record and register) |

## 2. The booking fee and the agent question (T1, T2)

### 2.1 What actually happens
Under DEC-107 the buyer pays one card charge, created **on the organiser's (or supplier's) own Stripe account**. Stripe deducts an **application fee** for the platform, which is the sum of (a) the seller fee (5% + VAT on tickets; 6–8% + VAT on bookings) and (b) the buyer's booking fee (£1 incl. VAT per ticket) or booking admin fee (2.5%, min £1, incl. VAT). `src/lib/payments/rules.ts` `directChargeLines` books the whole application fee as `platform_fee` plus `tax_payable`.

### 2.2 The characterisation problem
Two readings are possible:

1. **Gala Dock supplies a booking service to the buyer** (the texts say so: "Gala Dock charges a booking fee"). Then the seller receives the £1 as Gala Dock's collecting agent, and the application-fee mechanism is the remittance. Gala Dock accounts for VAT on £1 (1/6 = 16.7p). The seller must **not** treat the £1 as its own turnover.
2. **The whole charge is the seller's consideration** (the seller is merchant of record for the full amount, including the fee). Then the organiser owes output VAT on the £1 too (if VAT-registered), and Gala Dock's application fee is a single B2B supply to the organiser (on which Gala Dock charges VAT to the organiser, recoverable by it).

Reading 2 is what the cash flow looks like on paper. Reading 1 is what the texts and ledger assume. If HMRC picks reading 2 while Gala Dock files on reading 1, Gala Dock has (a) treated a B2B fee as B2C VAT-inclusive (under-accounting if the fee should have VAT added on top), and organisers have under-declared turnover.

**Recommendation (adviser to confirm):** adopt reading 1 expressly. Each seller, in its terms, **appoints Gala Dock's fee to be collected by the seller as disclosed agent for Gala Dock**, does not include it in its own turnover, and agrees that the application fee transfers it to Gala Dock. The buyer is told on the checkout and in the Ticket/Customer Terms that the booking fee is Gala Dock's charge for its own booking service. Stripe receipts should show the fee as a separate line identifying Gala Dock. Drafted in `redlines/03-payment-terms-v3.md` §2A and organiser/supplier v3.

### 2.3 Agent in own name (s.47(3))
VATA 1994 s.47(3): where services are supplied through an agent **acting in its own name**, the supply is treated as made to and by the agent. Live `/ticket-terms` says "Gala Dock sells tickets on the organiser's behalf"; Organizer Terms 2.1 says Gala Dock acts as commercial agent "to sell tickets, take payment and issue credentials". Gala Dock-branded checkout plus these words support an argument that Gala Dock contracts in its own name. That would make Gala Dock liable for VAT on the full ticket price (and, for non-VAT-registered organisers, VAT that nobody collected).

Fix: the organiser sells in its own name; Gala Dock acts only as a **disclosed** agent to conclude the contract in the organiser's name on its checkout, and the ticket/receipt names the organiser as seller (merchant identity is already shown at resale checkout, Q57). Drafted in `redlines/02` intro and `redlines/05` §2.1.

### 2.4 Commission (seller fee)
A B2B supply by Gala Dock to the seller of marketplace/software/payment-tool services. UK seller: standard-rated 20%. Gala Dock issues a VAT invoice (statement) to the seller showing its VAT number. Provider Terms 5.5 placeholder "[Tax adviser: confirm the invoicing model]" is resolved by: Gala Dock invoices its fees; sellers invoice their own customers.

## 3. Place of supply (T3, T4)

### 3.1 Commission to overseas business sellers
General B2B rule (VATA s.7A(2)(a)): supplied where the **customer belongs**. A French or US business seller → outside the scope of UK VAT; the customer self-accounts (reverse charge). `trg_checkout_order_vat` (`supabase/migrations/202610280020_vat.sql:44-47`) adds 20% to every commission. That over-charges non-UK sellers.

Exceptions to check (adviser): land-related services (Sch 4A para 1; HMRC Notice 741A §6) — **intermediary services relating to land** can be land-related. Commission on venue hire may be "land-related" so that place of supply is where the venue is. For a UK venue that is UK VAT whoever the seller is; for an overseas venue it is outside UK VAT.

**Engineering need:** store seller country and VAT status (some exist: `workspace` country, trader declaration); compute commission VAT = 20% only when the seller belongs in the UK (or venue in the UK if land-related applies); show "reverse charge" on statements otherwise. A non-business seller (non-trader individual) abroad: B2C → place of supply is the supplier's (UK) under the general B2C rule (s.7A(2)(b)) unless an exception applies (verify).

### 3.2 Booking fee and admin fee to consumers on overseas events/venues
If reading 1 (§2.2) applies, Gala Dock supplies an **intermediary service to a consumer** (arranging the ticket/booking). B2C intermediaries: supplied where the **underlying supply** is made (Sch 4A para 10). Underlying supply: admission to/services at an event → where the event takes place; venue hire → where the land is. So a booking fee on a Paris event is a French supply; on a Dublin venue, Irish. Gala Dock would owe local VAT, declarable through the EU **non-Union OSS** scheme (cross-brand §4: apply by the 10th of the month after the first EU sale).

Alternatively, the fee may be treated as "services connected with admission" (verify).

**Owner/adviser decision:** either (a) restrict paid ticketing and bookings to UK events/venues for launch (simplest; overseas sellers still list UK events), or (b) register for non-Union OSS and compute local VAT per event country. The current code assumes UK VAT on all fees.

### 3.3 Seller's own VAT
Sellers account for VAT on their tickets/services. Gala Dock does not, except under the deemed-supplier rules for goods (§4). Seller VAT on ticket sales where the event is overseas is the seller's matter. Terms must say so (Supplier v3 §5.5, Organiser v3 §6.5).

## 4. Merchandise and the online marketplace rules (T7)
- VATA s.5A (from 1 January 2021): an online marketplace that facilitates (a) imports of goods in consignments ≤ £135 to UK buyers, or (b) sales of goods located in the UK by **overseas sellers** to UK consumers, is **deemed the supplier** and must account for the VAT.
- VATA s.77B: joint and several liability for UK sellers' unpaid VAT where HMRC has notified the marketplace (verify current scope).
- Merch exists (API only, no UI caller: dec107 §6 item 5). Before merch launches: either restrict merch sellers to UK-established businesses selling goods located in the UK, or build deemed-supplier accounting. Also: product liability (Consumer Protection Act 1987), General Product Safety Regulations 2005 (and the Product Regulation and Metrology Act 2025, verify) — marketplace duties may follow.
- Merch sales by individuals are also PORR "sale of goods" (reportable above the de minimis — §5).

## 5. UK platform reporting: Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023 (T5)

### 5.1 Does it apply? **Yes, almost certainly.**
The Regulations (UK implementation of the OECD Model Rules for Reporting by Platform Operators, equivalent to EU DAC7) apply to a UK-resident **platform operator** that allows sellers to connect with users to carry out **relevant activities** for consideration. Relevant activities are: (a) **rental of immovable property**, (b) **personal services**, (c) **sale of goods**, (d) rental of means of transport.

| Gala Dock activity | Relevant activity? | Notes |
|---|---|---|
| Venue and space hire | **Yes: rental of immovable property** | Property address per listing; land registry number if available. Excluded seller: an entity for which the platform facilitated more than 2,000 rentals of one property listing in the period (verify) |
| Supplier services (catering, DJs, entertainers, AV crew, staffing, décor, transport with driver) | **Yes: personal services** (time- or task-based work by one or more individuals, at a user's request, online or offline) | Services through a company still count if performed by individuals (verify HMRC guidance) |
| Equipment hire (without operator) | Possibly sale/rental — not "personal services"; not immovable property; "means of transport" only for vehicles | Adviser to classify |
| Merch | **Yes: sale of goods** | De minimis: sellers with fewer than 30 sales and ≤ €2,000 consideration in the period are excluded (goods only) (verify UK figures) |
| Ticket sales by organisers | **Probably not** — admission to an organiser's event is not performed "at the request of the user" as a personal service; not goods | Adviser to confirm; record the reasoning |
| Resale (fans) | **Probably not** (resale is an organiser buy-back and refund under DEC-107) | Confirm |
| Partner commission | **No** (Gala Dock is the purchaser, not facilitating a sale between users) | — |

The fact that payments go to the seller's own Stripe account does **not** take Gala Dock out: the operator must report consideration "paid or credited" to the seller that is known or reasonably knowable to it — Gala Dock records every charge.

Excluded sellers include governmental entities and entities whose stock is regularly traded on an established market. "Excluded platform operator" status (for operators whose platform facilitates only non-reportable sellers) is not available here.

### 5.2 Timing
- Reporting period: calendar year. Report to HMRC by **31 January** after the year. If Gala Dock facilitates relevant activities in 2026, the first report is due **31 January 2027** (verify whether any live activity occurred in 2026; Stripe is in test mode).
- Notify HMRC/register as a platform operator through HMRC's digital platform reporting service (verify current registration step and deadline).
- Due diligence for new sellers must be completed by 31 December of the reportable period (verify).

### 5.3 Data to collect (per reportable seller)

**Individual sellers**
- first and last name;
- primary address;
- **TIN** (UK: NI number or UTR) and the jurisdiction that issued it; or a statement that none is issued;
- **date of birth**;
- VAT number (if any);
- financial account identifier (bank account where consideration is paid) and account holder name, where available to the operator (Stripe holds this; adviser to confirm whether the operator must report it when payment is through a PSP);
- for property: address of each property listing and land registration number (if available);
- jurisdiction(s) of residence.

**Entity sellers**
- legal name; primary address; TIN and issuing jurisdiction; business registration number; VAT number; existence of any permanent establishment through which relevant activities are carried out in the EU/reportable jurisdictions; financial account identifier; property details as above.

**Per seller, per quarter**
- total consideration paid or credited;
- number of relevant activities;
- fees, commissions or taxes withheld or charged by the platform.

### 5.4 Verification and reminders
- Operator must determine whether the information is reliable (using information available to it, e.g., Stripe KYC results, and any electronic interface the tax authority provides).
- If a seller doesn't provide the information after **an initial request and two reminders** (but before the end of a 60-day period — verify), the operator must **close the seller's account and prevent re-registration, or withhold payment of consideration** until it is provided (verify the exact UK formulation). Gigvora Payments Terms 6.7 implements this as a payout hold "to the extent those Regulations require"; Gala Dock v3 copies that (Payment Terms §9.1(h)).

### 5.5 Notices and data protection
- Tell each seller that information will be reported to HMRC and may be exchanged with other tax authorities; give each seller a copy of the reported information by 31 January.
- Lawful basis: UK GDPR Art 6(1)(c) legal obligation; retention 6 years (verify the record-keeping period in the Regulations).
- Privacy notice v3 §4 and retention v3 rows added.

### 5.6 EU DAC7
Gala Dock supports sellers in all EU states except Croatia (blocked, "preview") and allows EU venues. A **non-Union platform operator** facilitating EU-resident sellers or EU property rentals must register in one member state and report under DAC7, **unless** it is a "qualified non-Union platform operator" (all relevant activities are covered by an effective qualifying competent authority agreement with a qualified non-Union jurisdiction). Whether the UK is so designated must be checked (verify the Commission implementing act listing qualified jurisdictions). If not designated: register in one EU state (e.g., Ireland) or restrict EU sellers (decision D2).

### 5.7 Penalties
The Regulations carry fixed penalties, daily penalties for continued failure and penalties for inaccurate information (verify amounts; HMRC published figures of up to £5,000 per inaccuracy in guidance — verify). Seller-side failures can be passed on contractually only as far as reasonable.

### 5.8 What engineering needs to build (owner decision D7)
1. At payout set-up (after the trader declaration), a **Tax details** step: legal name, address, DOB (individuals), TIN + issuing country (or "not issued"), VAT number, company number; property addresses for venue listings.
2. Reminder workflow (initial + 2 reminders), then payout hold with a PORR basis (add `tax_reporting` to the `adm_payout_pause` basis list, automatic not discretionary).
3. Quarterly aggregation per seller from the ledger (consideration, count, fees).
4. Annual XML/HMRC submission and seller copy.
5. Classification flag per listing category (reportable activity type).

## 6. Partner self-billing (T8)
VAT Regulations 1995 reg 13(3) and VAT Notice 700/62 conditions for self-billing:
1. A **prior written agreement** with each supplier (here: VAT-registered UK partners) in which the supplier agrees (a) to the customer issuing self-billed invoices, (b) **not to issue its own VAT invoices** for those supplies, (c) to **tell the customer if it stops being VAT-registered, changes VAT number, or transfers its business**; and the customer agrees to issue invoices with the supplier's name, address and VAT number and all the required details.
2. The agreement is reviewed/renewed at least every **12 months** or for the term of the contract (verify).
3. Each self-billed invoice must carry the statement **"The VAT shown is your output tax due to HMRC"** (Notice 700/62).
4. A **sequential number** based on one or more series that uniquely identifies the document (reg 14(1)(a)); a separate series per supplier is good practice. Current `GDSB-YYYYMM-<8 hex>` is unique, not sequential (M-42).
5. Keep a list of self-billing suppliers with names, addresses, VAT numbers and agreement dates.

Current product: consent captured at application (good), but the referenced agreement text does not exist (M-03) and wording/numbering need changes (M-42, M-43). Partner v3 Schedule 1 contains the agreement.

**Net-of-VAT base** (owner decision): lawful and sensible — VAT collected on subscriptions isn't Gala Dock revenue. For overseas VAT-registered partners, Gala Dock self-accounts under the reverse charge on the services received (VATA s.8); no UK VAT is added (built).

## 7. Other tax points
- **Stripe Connect fees paid by Gala Dock** (`connect_fees_payer = application`): Gala Dock's own cost; no VAT issue for sellers.
- **Chargeback fees** (£20) debited to sellers by Stripe: Stripe's charge to the seller, not Gala Dock's supply.
- **Fee refunds**: VAT on the refunded part of the seller fee must be adjusted (credit note); `feeRefundLines` reverses `tax_payable` (good). Keep credit notes for 6 years.
- **Organiser fees retained on cancellation** (Organiser Terms 2.4(b)): consideration for services performed, standard-rated; not compensation (outside scope) — supports the "not a penalty" framing.
- **Circumvention fee** (if introduced): HMRC may treat as consideration for a supply (release from restriction) → VAT (verify).
- **Income tax on sellers**: sellers' own responsibility; PORR reporting does not change that.
- **IR35/off-payroll**: Gala Dock is not the client or fee-payer for supplier engagements; organiser clients may be (medium/large clients). Supplier v3 §4.5.

## 8. Questions for the tax adviser (also in `counsel-questions.md`)
1. Confirm reading 1 (Gala Dock supplies the booking service to the buyer; seller collects as disclosed agent) and the documentation needed.
2. Confirm no s.47(3) exposure once the texts are corrected; any exposure for the period the old words were live (since 12 October 2026; Stripe in test mode, so likely no real supplies).
3. Place of supply of commission on venue bookings (land-related intermediary?) and on supplier services.
4. Place of supply of booking fees on overseas events/venues; OSS registration vs restricting to UK events.
5. PORR classification of ticket sales, equipment hire, venue hire through operators with >2,000 rentals; data the operator must report when payments go through a PSP; first reporting year.
6. DAC7 qualified non-Union status of the UK.
7. Self-billing numbering and renewal.
8. Merch: s.5A deemed supplier — restrict or build.
