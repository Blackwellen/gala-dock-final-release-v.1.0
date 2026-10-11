# DPIA — Break-glass access to member conversations

Status: **Approved** — signed off by Jamahl Thomas, Data Protection Officer, 11 October 2026 · Owner: Platform Admin · Spec: release-readiness part 1 §5 (access), §7 (step-up MFA)
Implementation: `supabase/migrations/202610250002_break_glass.sql`, `202610250003_break_glass_grant_meta.sql`, `202610270001_break_glass_policy.sql`, `/admin/conversations`

## 1. What the processing is

Authorised Gala Dock staff can read the contents of private conversations between members (customers, organisers, providers, team members) **only** when investigating a specific open support or Trust & Safety case, for one of six purposes: safeguarding, fraud, abuse, payment dispute, legal request, or critical support investigation.

There is no general "read anyone's messages" capability. Default support staff cannot browse conversations; even holders of the break-glass permission see message text only through a time-limited, case-linked, audited grant.

## 2. Necessity and proportionality

| Control | How it is enforced |
|---|---|
| Dedicated permission | `support.break_glass_conversation.read` on `platform_admins.permissions`; not part of the default support role. Database functions check it server-side. |
| Case-linked | A request must reference an **open** support case or a Trust & Safety case. |
| Minimum scope | Only conversations in which a person on that case participates can be requested, at most 20 per grant. The list before access shows metadata only (subject, type, message count, date) and never message text. |
| Justification | A reason category plus a written justification of at least 20 characters. |
| Four-eyes for high risk | Safeguarding, abuse and legal requests stay *pending* until a **different** administrator approves with a note, whenever another administrator holds the permission. Self-approval is blocked in the database. While only one administrator holds it (current position), requests are granted on submission and recorded as `sole_holder` in the audit trail; approval switches on automatically when a second holder is added (DPO decision, 11 October 2026). |
| Time-limited | Grants last 30 minutes to 8 hours (default 2 hours) and expire automatically. |
| Step-up authentication | Message text is returned only if the administrator verified their authenticator (TOTP/WebAuthn) within the last 10 minutes (`amr` timestamp in the session token). |
| Read-only | The admin UI and functions have no send, edit, delete or impersonate path. Members' own RLS policies are unchanged. |
| Individual logging | Each conversation opened creates a `break_glass_access_log` row (open, heartbeat, close, so duration is known) and an `audit_events` row. |

## 3. Data stored about each access

Requester, approver (where required), reason, justification, case type and reference, affected users, conversations in scope, start, expiry, closure, each conversation opened with its duration, and the notification decision (sent, or withheld with a reason).

## 4. Transparency and user notification

- **Privacy notice:** the public privacy policy must state that authorised staff may access conversation content where necessary to investigate safety, fraud, abuse, payment disputes or legal requests, under strict controls and logging. *Action: Public Pages owner to add this paragraph.*
- **After closure:** when access is closed, affected users are notified by default with an in-app notification naming the investigation type and case reference. The administrator may withhold notification only by recording a reason (for example, notifying would prejudice a fraud, safety or legal investigation). Withheld notifications are flagged in the compliance report for DPO review.

## 5. Oversight

- **Compliance report** (`/admin/conversations?tab=report`, also visible to the `audit` permission): requests, approvals, conversations opened, minutes of access and withheld notifications over the period.
- **Suspicious-access flags:** 5+ requests by one person within 7 days; requests outside 07:00–20:00 London time; the requester being a participant in the conversations; broad access (10+ conversations opened under one grant); withheld notifications.
- **Periodic review:** the DPO, or an administrator with `audit`, reviews flagged grants monthly and records the outcome on the related case.

## 6. Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Curiosity browsing by staff | Low / High | Case link, scope limit, justification, logging, flags, monthly review |
| Compromised admin account | Low / High | Admin MFA at login plus step-up within 10 minutes; short grants; four-eyes on high-risk reasons |
| Over-collection | Medium / Medium | Per-conversation selection; metadata-only listing; no export from the reader |
| Chilling effect on members | Medium / Low | Privacy notice; notification after closure by default |
| Retention of access logs | Low / Medium | Grants, access logs and their audit rows are kept for **6 years** after the grant ends (Limitation Act 1980 s.5; UK GDPR Art. 5(1)(e) and 5(2)), then deleted by a monthly scheduled job (`bg_purge`). See the Data Retention Schedule. |

## 7. Decisions and sign-off

| Item | Decision |
|---|---|
| Approver model | Four-eyes approval for high-risk reasons applies whenever a second administrator holds the permission; a sole holder's requests are granted and flagged for review. |
| Retention | 6 years after the grant ends, then deleted automatically (monthly). |
| Privacy notice | Disclosure published in the Privacy Policy (section "Access to your messages by Gala Dock staff"). |
| Permission holders | Currently one: the Data Protection Officer's Platform Admin account. |

Signed off: **Jamahl Thomas, Data Protection Officer** — 11 October 2026. Next review: 11 October 2027, or earlier if the processing changes.
