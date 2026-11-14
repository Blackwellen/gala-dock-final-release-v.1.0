# Online Safety Act 2023: applicability, duties and gaps (Q54, 2026-11-14)

> **AI review, not legal advice.** Ofcom's codes and guidance change; dates and section numbers marked **(verify)** must be checked against the current Ofcom register before relying on them.

## 1. Is Gala Dock in scope? **Yes.**

**User-to-user service (OSA s.3(1)):** an internet service by which content generated, uploaded or shared by one user may be **encountered** by another user. Gala Dock has:

| Feature | User-generated content encountered by others |
|---|---|
| Messaging between customers, organisers, providers and support | Yes (private messages count for illegal-content duties) |
| Public event pages, venue/service listings, organiser and provider profiles | Yes (written and uploaded by business users) |
| Reviews and provider responses | Yes |
| Public/link templates (Media Studio community) | Yes |
| Resale listings | Yes (limited) |
| Guest lists, shared plans, attachments | Yes, within workspaces |

**Links with the UK (s.4(5)–(6)):** UK users are a target market; the service is UK-based. **In scope.**

**Exemptions (Sch 1):**
- Para 4 "limited functionality services" covers services where users can only post comments/reviews on content published by the provider. Gala Dock's listings are published by users (businesses), not by Gala Dock, and there is direct messaging → **exemption does not apply**.
- Para 1–2 (email/SMS/MMS only; one-to-one live aural) → not applicable.
- Internal business services (para 7) → not applicable to the public marketplace.

**Categorisation:** Gala Dock will not meet Category 1, 2A or 2B thresholds (user numbers far below). Only the duties for **all** regulated user-to-user services apply, plus children's duties if the child user condition is met. Fees regime: only above the qualifying worldwide revenue threshold (£250m, verify) → not applicable.

## 2. Duties that apply

| Duty | Section | Status at Gala Dock | Gap |
|---|---|---|---|
| **Illegal content risk assessment** (suitable and sufficient; kept up to date; before significant changes) | s.9 | **Not done** (no record in repo) | **High.** Must be completed and recorded before launch (Ofcom: services new to the market should complete it before launch — verify). Use Ofcom's Risk Assessment Guidance and Risk Profiles. Likely risk factors: direct messaging, user profiles, fraud (fake listings, ticket scams, payment diversion), harassment, hate, intimate image abuse in uploads, CSEA via messaging if children can access, sanctions/terrorism (low). |
| **Illegal content safety duties** (proportionate measures; swift takedown on awareness) | s.10 | Partial: moderation of templates; trust enforcement; AV scanning; break-glass for messages | **High.** Follow Ofcom Illegal Content Codes of Practice for user-to-user services (in force 17 March 2025). For a small, low/specific-risk service the core measures are: a named senior person accountable for illegal-content duties; content moderation function that swiftly takes down illegal content; reporting and complaints; terms of service provisions; plus risk-specific measures (e.g., fraud keyword detection is for larger services). |
| **Terms of service provisions** (how users are protected from illegal content; proactive technology used; clear, accessible, consistently applied) | s.10(5)–(8) | None in `/terms` | **High.** Drafted: `redlines/01` §8, `redlines/17`. |
| **Content reporting** (easy to use, for illegal content and, where relevant, content harmful to children) | s.20 | Only template reports; **no report button on messages, users, listings, event pages or reviews** (M-70); AUP claims one exists | **High.** Build a report action on each content type + a public report form for non-users. |
| **Complaints procedures** (illegal content complaints; complaints by users whose content is taken down; complaints about non-compliance with duties; appeals) | s.21 | Complaints Policy covers moderation appeals generally; no OSA categories | **High.** Complaints v3 §5. |
| **Freedom of expression and privacy** (have particular regard when deciding safety measures) | s.22 | Break-glass and DPIA are strong on privacy | Low. Record in the risk assessment. |
| **Record-keeping and review** (written records of risk assessments and code measures; review compliance regularly) | s.23 | None | **Med.** Keep an OSA register; retention row added. |
| **Children's access assessment** | ss.35–37 | Not done | **High.** Must be completed and recorded. See §3. |
| **Children's risk assessment and safety duties** | ss.11–12 | N/A unless child user condition met | Depends on §3. |
| **CSEA reporting to the NCA** | s.66 | No process | **Med** (commencement via regulations — verify). Safeguarding v3 §4.7. |
| **Information and cooperation with Ofcom** | Part 7 | — | Name a point of contact. |

## 3. Children's access assessment
- Accounts are for 18+ (self-declared). Tickets "may be bought for younger attendees" by adults.
- Ofcom's guidance (verify) is that a service can only conclude it is **not possible for children to access** it if it uses **highly effective age assurance** that prevents access. Self-declaration does not count.
- Then the **child user condition**: a significant number of children use the service, or it is of a kind likely to attract a significant number of children. Concert and festival ticketing can attract 16–17-year-olds. Planning tools for children's parties are used by parents, not children.
- **Likely outcome (counsel to confirm):** some risk that teenagers sign up to buy tickets. Options:
  1. Keep 18+, assess as "not likely to attract a significant number of children", with evidence (marketing targeted at adults; payment card required; age prompts), and monitor. Lower cost; some regulatory risk.
  2. Add age assurance at sign-up (e.g., card check or a third-party age estimate) to support "not possible to access". Higher cost/friction.
  3. Accept child users (16–17) for ticket purchase with children's risk assessment and safety duties (messaging restrictions; default settings). Highest cost.
- Recommendation: option 1 with the assessment recorded, **messaging limited to booking-linked threads** (already largely true), no public user-to-user discovery of private individuals, and review after 3 months of live data.
- ICO Age Appropriate Design Code applies to services "likely to be accessed by children" (separate test under DPA 2018 s.123) — record the same analysis.

## 4. Priority illegal content most relevant to Gala Dock (Sch 5–7)
- **Fraud and financial services offences** (Fraud Act 2006; FSMA 2000 s.21 financial promotions): fake events, fake venues, ticket scams, payment diversion ("pay me by bank transfer"), fake suppliers. Highest-likelihood harm.
- **Harassment, stalking, threats** (Protection from Harassment Act 1997; Malicious Communications Act 1988; s.181 OSA false/threatening communications) via messaging and reviews.
- **Hate offences** (Public Order Act 1986 Parts 3–3A) in listings/reviews.
- **Intimate image abuse** (Sexual Offences Act 2003 s.66B) in uploads.
- **CSEA** (grooming; indecent images) — low likelihood given 18+, but messaging and children's-party contexts mean it must be assessed.
- **Terrorism** and **weapons/drugs sales** — low; listings moderation.
- **Unlawful immigration / human trafficking** (staffing listings; Modern Slavery Act 2015) — low/medium for staffing suppliers.
- **Sanctions** are not OSA priority offences but are a separate legal duty (see insulation map S9).

## 5. Terms-of-service wording (summary of v3 drafts)
`redlines/01-terms-of-service-v3.md` §8 and `redlines/17-acceptable-use-and-online-safety-v3.md` include:
1. What counts as illegal content and prohibited content, with examples relevant to events and marketplaces.
2. How to report (in-app on every content type; public form; email), what happens, and target times.
3. Proactive technology used: malware scanning of uploads (AV gateway), automated fraud/risk signals, rate limits, keyword flags (if built). No CSAM hash matching unless and until it is switched on — do not claim it.
4. Human review before account-level action (except failed malware scans).
5. Statements of reasons to the affected user and the reporter, unless unlawful or unsafe.
6. Appeals by someone not involved in the decision (single-staff fallback: external reviewer, as Gigvora 27.4).
7. Complaints routes (OSA s.21) and independent routes (Ofcom, ICO, courts).
8. Messages: private, not monitored, break-glass access only for case-linked reasons.

## 6. EU Digital Services Act (if EU users are accepted)
Applies to intermediary services offered to recipients established or located in the EU, wherever the provider is. Gala Dock = hosting service and online platform (and online marketplace).
- **Art 13 legal representative in the EU**: required for providers without an EU establishment — **no micro/small enterprise exemption**. Gap.
- Arts 11–12 points of contact for authorities and recipients; Art 14 T&Cs content; **Art 16 notice and action**; **Art 17 statement of reasons**; Art 18 notification of suspected serious criminal offences — apply to all hosting services.
- Online platform obligations (Arts 20–28, incl. internal complaints, trusted flaggers, dark patterns, ad transparency) and marketplace obligations (Arts 30–32: trader traceability/KYBC, compliance by design, right to information) — **micro and small enterprises are exempt** (Arts 19, 29), except Art 24(3) user numbers on request (verify). Blackwellen is likely micro/small.
- Decision D2: restrict to UK, or appoint an Art 13 representative and implement Arts 11–18.

## 7. Action plan
1. Complete and sign the **illegal content risk assessment** and **children's access assessment** (Ofcom templates); store in `docs/compliance/osa/` with a review date (90 days after launch, then yearly).
2. Name the **senior accountable person** (director) and a deputy/external cover.
3. Build **Report** on messages, users, listings, events, reviews, templates, resale listings; public report form; triage queue with priority for CSEA/threats/fraud.
4. Statement-of-reasons templates (`trust_notify_workspace` already sends reasons for enforcement — extend to content removal and reporters).
5. Appeals route; complaints categories; OSA record-keeping register.
6. Publish v3 Terms §8 and AUP v3.
7. Decide CSAM hash matching (e.g., IWF list) for image uploads — proportionate given children's-party and school-event contexts; at least plan it.
8. Train staff (Safeguarding §6 already requires annual training).
