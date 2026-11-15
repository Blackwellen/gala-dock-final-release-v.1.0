---
title: Data Processing Addendum
summary: The UK GDPR Article 28 terms under which Gala Dock processes personal data for organisers (and, where relevant, suppliers), with the security measures and sub-processor list.
---

This Addendum forms part of the Organiser Terms (and, where relevant, the Supplier Terms) between the business customer ("**Controller**") and Blackwellen Limited (company 16482166), 61 Bridge Street, Kington, Herefordshire, HR5 3DJ, trading as Gala Dock ("**Processor**"). It applies where Gala Dock processes personal data on the Controller's behalf.

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

5.1 The Controller authorises the sub-processors in Annex 3. Gala Dock gives at least **30 days'** notice of a new sub-processor by email to workspace owners and by updating Annex 3 on this page. The Controller may object on reasonable data protection grounds; if unresolved, it may terminate the affected service and get a pro-rata refund of prepaid fees.

5.2 Gala Dock imposes equivalent obligations on each sub-processor and remains liable for them.

## 6. International transfers

Where sub-processors process data outside the UK, Gala Dock relies on UK adequacy regulations (including the UK Extension to the EU–US Data Privacy Framework for certified providers) or the IDTA / Addendum to the EU SCCs, with transfer risk assessments.

## 7. Confidentiality and break-glass

Staff don't browse customer content. Access to private conversations is only through the audited, time-limited, case-linked break-glass process in the Privacy Policy; read-only; individually logged.

## 8. Audits

Gala Dock responds to reasonable written information requests. On-site audits at most once a year, on 30 days' notice, in business hours, by an auditor bound by confidentiality, at the Controller's cost unless a breach by Gala Dock has been established.

## 9. Return and deletion

On termination the Controller can export data with in-product tools for **30 days**. Gala Dock then deletes the Controller's personal data within a further 60 days, except where retention is required by law or the data is held as an independent controller. Deleted data leaves backups within 65 days.

## 10. Liability

10.1 Each party's liability under this Addendum is subject to the limits in the Terms of Service §12, which apply to this Addendum as part of the Organiser or Supplier Terms. This doesn't limit either party's liability to data subjects under Art 82 UK GDPR, or any apportionment between the parties under Art 82(5).

10.2 The Controller indemnifies Gala Dock against claims and fines (to the extent lawful) resulting from the Controller's instructions or its collection of data without a lawful basis.

## Annex 2: Security measures

TLS 1.2 or higher in transit and provider-managed AES-256 encryption at rest; row-level security on every workspace table; role-based permissions; two-step verification for all users, enforceable per workspace; mandatory MFA and step-up verification for administrators; idle timeout; server-only secrets; hashed API keys; signed webhooks; signed rotating ticket credentials; audit logs including break-glass access; rate limiting; file type validation and malware scanning of uploads; dependency scanning; maintenance and lockdown controls; daily backups and encrypted off-site copies (up to 63 days); an incident response and disaster recovery runbook with rehearsals; data subject request tracking, export and deletion with anonymisation.

## Annex 3: Sub-processors

| Sub-processor | Purpose | Location | Transfer mechanism |
|---|---|---|---|
| Supabase Inc. | Database, authentication, file storage | London (UK) region; support access may be from outside the UK | IDTA or Addendum for any non-UK access |
| Vercel Inc. | Application hosting | London (UK) functions; global delivery network; US support | UK Extension to DPF / IDTA |
| Cloudflare Inc. | R2 object storage and encrypted backups; Turnstile | Global network, including the US | UK Extension to DPF / IDTA |
| Resend Inc. | Transactional email | US | UK Extension to DPF where certified, otherwise IDTA / Addendum |
| Microsoft (Azure OpenAI Service) | Gala Agent for organisers and suppliers | Azure region of our deployment; abuse monitoring under Microsoft's terms | UK adequacy (EEA) / UK Extension to DPF; Microsoft Data Protection Addendum |
| MapTiler AG | Maps and geocoding (server-side) | Switzerland | UK adequacy |
| Blackwellen virus-scanning service (Blackwellen Limited's own infrastructure) | Malware scanning of uploads | Infrastructure Blackwellen Limited controls | Not a third party |
| Stripe Payments UK Ltd / Stripe Inc. | Payments (independent controller for its regulated activities) | UK, EU and US | Stripe data processing terms |

No other AI provider processes Controller data.
