# Data Processing Addendum (UK GDPR Article 28)

> **Draft for specialist UK legal review before production publication.** Version 2026-10.

This Addendum forms part of the Organizer Terms (and, where relevant, the Provider Marketplace Terms) between the business customer ("**Controller**") and Blackwellen Ltd, trading as Gala Dock ("**Processor**"). It applies where Gala Dock processes personal data on the Controller's behalf.

## 1. Scope and roles

1.1 **Processor activities.** Gala Dock processes the following personal data as the Controller's processor:
* attendee and guest lists;
* ticket-holder details and buyer-question answers the Controller collects;
* crew, staff and team scheduling data;
* client and lead records in Sales;
* content the Controller stores in its workspace, including designs, documents and messages within its workspace.

1.2 **Independent controller activities.** Gala Dock acts as an independent controller, not as processor, when processing personal data for its own purposes:
* operating user accounts and authentication;
* payments, fraud prevention and financial record-keeping;
* marketplace operation, including reviews, reliability scores and dispute handling;
* trust and safety;
* legal compliance;
* service analytics and improvement using aggregated data.

These purposes are described in the Privacy Notice.

## 2. Details of processing (Annex 1)

| Item | Description |
|---|---|
| Subject matter | Provision of the Gala Dock event management and marketplace platform |
| Duration | The term of the Organizer Terms plus the deletion period in section 9 |
| Nature and purpose | Hosting, storing, organising, displaying, transmitting, analysing (at the Controller's request), and generating credentials and communications for events |
| Data subjects | Attendees, guests, ticket buyers, the Controller's staff, crew and contractors, clients and prospects, suppliers' contacts |
| Categories of data | Identity and contact details; ticket and order details; check-in records; dietary and access requirements; schedules; messages; images |
| Special category data | Only where the Controller collects it, for example dietary needs revealing religious belief or health data relating to accessibility. The Controller must have an Art. 9 condition and should collect only what is necessary |

## 3. Processor obligations

Gala Dock shall:
1. process personal data only on the Controller's documented instructions (these terms, the Controller's configuration of the service and its use of features), unless UK law requires otherwise, in which case Gala Dock will inform the Controller unless legally prohibited;
2. ensure people authorised to process the data are bound by confidentiality;
3. implement the technical and organisational measures in Annex 2;
4. respect the conditions for engaging sub-processors in section 5;
5. assist the Controller, taking into account the nature of processing, with data subject requests, through the export, correction and deletion tools in the product and, where needed, on request;
6. assist the Controller with security, breach notification, DPIAs and prior consultation (Arts. 32–36);
7. at the Controller's choice, delete or return personal data at the end of the service (section 9);
8. make available the information necessary to demonstrate compliance and allow for audits (section 8).

## 4. Personal data breaches

Gala Dock will notify the Controller without undue delay, and in any event within **48 hours** of becoming aware of a personal data breach affecting the Controller's data. The notice will include the information available at the time, as required by Art. 33(3), and will be updated as the investigation progresses.

## 5. Sub-processors (Annex 3)

5.1 The Controller authorises the sub-processors in Annex 3. Gala Dock will give at least **30 days' notice** of a new sub-processor by email to workspace owners and on the sub-processor page. The Controller may object on reasonable data protection grounds; if the parties can't resolve the objection, the Controller may terminate the affected service and receive a pro-rata refund of prepaid fees.

5.2 Gala Dock imposes data protection obligations on each sub-processor equivalent to this Addendum and remains liable for them.

## 6. International transfers

Where sub-processors process data outside the UK, Gala Dock relies on UK adequacy regulations or the UK International Data Transfer Agreement / Addendum to the EU SCCs, with transfer risk assessments.

## 7. Confidentiality and break-glass access

Gala Dock staff do not browse customer content. Access to private conversations for safeguarding, fraud, legal or critical support reasons is only through the audited, time-limited break-glass process described in the Privacy Notice and the DPIA. Access is case-linked, read-only and individually logged.

## 8. Audits

Gala Dock will respond to reasonable written information requests about its compliance. On-site audits may be conducted no more than once a year, on 30 days' notice, during business hours, by an auditor bound by confidentiality and at the Controller's cost, unless a breach by Gala Dock has been established.

## 9. Return and deletion

On termination, the Controller can export its data using the in-product tools for **30 days**. Gala Dock then deletes the Controller's personal data within a further 60 days, except where retention is required by law (for example financial records) or the data is held by Gala Dock as an independent controller. Backups expire in the ordinary cycle.

---

## Annex 2: Security measures (summary)

* **Encryption:** in transit (TLS 1.2+) and at rest (provider-managed AES-256).
* **Access control:**
  * row-level security on every workspace table;
  * role-based permissions;
  * two-step verification available to all users and enforceable per workspace;
  * mandatory MFA and step-up verification for platform administrators;
  * administrator idle timeout.
* **Secrets:** server-only, held in managed environment configuration and vaults, and never sent to browsers.
* **Credentials:**
  * API keys hashed at rest;
  * webhook payloads signed;
  * ticket credentials cryptographically signed and rotating.
* **Auditing:** audit logs for administrative, financial, security and data-access events, plus a break-glass access log.
* **Platform hardening:**
  * rate limiting;
  * file type validation on uploads;
  * dependency vulnerability scanning;
  * maintenance and security lockdown controls.
* **Resilience:** daily database backups, plus an incident response and disaster recovery runbook.
* **Data rights:** DSAR tracking, self-service export, and account deletion with anonymisation.

## Annex 3: Sub-processors

| Sub-processor | Purpose | Location | Transfer mechanism |
|---|---|---|---|
| Supabase Inc. | Database, authentication, storage | UK (London region) | Data in UK; [confirm support access transfers] |
| Vercel Inc. | Application hosting | [Confirm region] / US | UK IDTA / adequacy (DPF UK extension) |
| Stripe Payments UK Ltd / Stripe Inc. | Payments (independent controller for its regulated activities) | UK/EU/US | Stripe DPA |
| Microsoft (Azure OpenAI Service) | Gala Agent AI processing | [Confirm region] | Microsoft DPA |
| MapTiler AG | Maps and geocoding | Switzerland | UK adequacy |
| Resend Inc. *(when enabled)* | Transactional email | US | UK IDTA / DPF |
| Cloudflare Inc. *(when enabled)* | Object storage (R2) | [Confirm jurisdiction setting] | Cloudflare DPA |

---
*Counsel review points:* the processor/independent controller split (1); 48-hour breach notice (4); sub-processor locations and transfer mechanisms (Annex 3) need verification against current vendor terms.
