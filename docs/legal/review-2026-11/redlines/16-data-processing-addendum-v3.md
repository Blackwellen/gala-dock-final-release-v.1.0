# Gala Dock Data Processing Addendum (v3 draft, gd-dpa-3.0)

> **DRAFT v3: not in force, not published.** Q54 legal review, 2026-11-14 (AI review, not legal advice). Replaces the DPA 2026-10 (never published, so no Art 28(3) contract exists today — behaviour-mismatches M-01). Clauses 1–9 keep the 2026-10 substance (which met Art 28(3)); changes: liability (§10), Annex 3 verified list with placeholders to resolve, backups (§9), supplier data sets (§1.3). Accepted with the Organiser Terms and, where relevant, the Supplier Terms.

This Addendum forms part of the Organiser Terms (and, where relevant, the Supplier Terms) between the business customer ("**Controller**") and Blackwellen Limited, trading as Gala Dock ("**Processor**"). It applies where Gala Dock processes personal data on the Controller's behalf.

## 1. Scope and roles
1.1 **Processor activities:** attendee and guest lists; ticket-holder details and buyer-question answers the Controller collects; crew, staff and scheduling data; client and lead records in Sales; content the Controller stores in its workspace (designs, documents, workspace messages).
1.2 **Independent controller activities:** user accounts and authentication; payments, chargebacks, fraud prevention and financial records; tax reporting; marketplace operation (reviews, reliability scores, disputes); trust and safety and online safety; legal compliance; aggregated analytics. Described in the Privacy Policy.
1.3 **Suppliers:** booking details a supplier receives to deliver a booking are held by the supplier as an independent controller (Supplier Terms §9), not under this Addendum.

## 2. Details of processing (Annex 1)
| Item | Description |
|---|---|
| Subject matter | Provision of the Gala Dock event management and marketplace platform |
| Duration | Term of the Organiser Terms plus the deletion period in §9 |
| Nature and purpose | Hosting, storing, organising, displaying, transmitting, analysing at the Controller's request, and generating credentials and communications for events |
| Data subjects | Attendees, guests, ticket buyers, the Controller's staff, crew and contractors, clients and prospects, suppliers' contacts |
| Categories | Identity and contact; ticket and order details; check-ins; dietary and access requirements; schedules; messages; images |
| Special category | Only where the Controller collects it (for example dietary needs revealing religion, access needs revealing health). The Controller must have an Art 9 condition and collect only what is necessary |

## 3. Processor obligations
Gala Dock shall: (1) process only on the Controller's documented instructions (these terms, its configuration and use of features), unless UK law requires otherwise, telling the Controller unless prohibited; (2) bind authorised people to confidentiality; (3) apply the measures in Annex 2; (4) follow §5 for sub-processors; (5) assist with data subject requests through product tools and, where needed, on request; (6) assist with security, breach notification, DPIAs and prior consultation (Arts 32–36); (7) delete or return data at the end (§9); (8) make available information to demonstrate compliance and allow audits (§8). Gala Dock will tell the Controller if it thinks an instruction infringes data protection law.

## 4. Breaches
Gala Dock notifies the Controller without undue delay and in any event within **48 hours** of becoming aware of a personal data breach affecting the Controller's data, with the Art 33(3) information then available, updated as the investigation progresses.

## 5. Sub-processors
5.1 The Controller authorises the sub-processors in Annex 3. Gala Dock gives at least **30 days'** notice of a new sub-processor by email to workspace owners and on galadock.com/legal/sub-processors. The Controller may object on reasonable data protection grounds; if unresolved, it may terminate the affected service and get a pro-rata refund of prepaid fees.
5.2 Gala Dock imposes equivalent obligations on each sub-processor and remains liable for them.

## 6. International transfers
Where sub-processors process data outside the UK, Gala Dock relies on UK adequacy regulations (including the UK Extension to the EU–US Data Privacy Framework for certified providers) or the IDTA / Addendum to the EU SCCs, with transfer risk assessments.

## 7. Confidentiality and break-glass
Staff don't browse customer content. Access to private conversations is only through the audited, time-limited, case-linked break-glass process in the Privacy Policy and DPIA; read-only; individually logged.

## 8. Audits
Gala Dock responds to reasonable written information requests. On-site audits at most once a year, on 30 days' notice, in business hours, by an auditor bound by confidentiality, at the Controller's cost unless a breach by Gala Dock has been established.

## 9. Return and deletion
On termination the Controller can export data with in-product tools for **30 days**. Gala Dock then deletes the Controller's personal data within a further 60 days, except where retention is required by law or the data is held as an independent controller. Deleted data leaves backups within 65 days.

## 10. Liability
10.1 Each party's liability under this Addendum is subject to the limits in the Terms of Service §12, which apply to this Addendum as part of the Organiser or Supplier Terms. This doesn't limit either party's liability to data subjects under Art 82 UK GDPR, or any apportionment between the parties under Art 82(5).
10.2 The Controller indemnifies Gala Dock against claims and fines (to the extent lawful) resulting from the Controller's instructions or its collection of data without a lawful basis.

## Annex 2: Security measures
[Unchanged from 2026-10: TLS 1.2+ and provider-managed AES-256 at rest; row-level security on every workspace table; role-based permissions; two-step verification for all users, enforceable per workspace; mandatory MFA and step-up for administrators; idle timeout; server-only secrets; hashed API keys; signed webhooks; signed rotating ticket credentials; audit logs incl. break-glass; rate limiting; file type validation **and malware scanning of uploads**; dependency scanning; maintenance and lockdown controls; daily backups and encrypted off-site copies (up to 63 days); incident response and disaster recovery runbook with rehearsals; DSAR tracking, export and deletion with anonymisation.]

## Annex 3: Sub-processors
| Sub-processor | Purpose | Location | Transfer mechanism |
|---|---|---|---|
| Supabase Inc. | Database, authentication, file storage | [UK (London) region: confirm]; support access [confirm] | IDTA for any non-UK access |
| Vercel Inc. | Application hosting | [Confirm function region] / US | UK Extension to DPF / IDTA |
| Cloudflare Inc. | R2 object storage and encrypted backups; Turnstile | [Confirm R2 jurisdiction setting] | UK Extension to DPF / IDTA |
| Resend Inc. | Transactional email | US | IDTA / Addendum [confirm DPF] |
| Microsoft (Azure OpenAI Service) | Gala Agent for organisers and suppliers | [Confirm region and data zone] | UK adequacy (EEA) / Microsoft DPA |
| MapTiler AG | Maps and geocoding (server-side) | Switzerland | UK adequacy |
| Blackwellen operations AV gateway (Blackwellen Limited's own infrastructure) | Malware scanning of uploads | [Confirm host location] | Not a third party |
| Stripe Payments UK Ltd / Stripe Inc. | Payments (independent controller for its regulated activities) | UK/EU/US | Stripe DPA |

No other AI provider processes Controller data.
