# Gala Dock legal document pack

> **Draft for specialist UK legal review before production publication.** None of these documents has been approved by a solicitor or barrister. They are working drafts that describe how the product actually behaves, written so counsel can review them efficiently.

**Operator:** Blackwellen Ltd, trading as Gala Dock · Company number **[COMPANY NUMBER]** · Registered office **[REGISTERED ADDRESS]** · VAT number **[VAT NUMBER — if registered]** · ICO registration **[ICO REGISTRATION NUMBER]**

These placeholders must be completed from verified company records. `src/lib/legal.ts` holds the same fields for the published pages and currently leaves them empty.

## Published pages (in the app)

| # | Document | Location | Status |
|---|---|---|---|
| 1 | Platform Terms of Service | `/terms` | Published draft, needs counsel review |
| 6 | Ticket Purchase Terms (with resale summary) | `/ticket-terms` | Published draft, needs counsel review |
| 10 | Privacy Notice | `/privacy` | Published draft; DPIA for break-glass access in `docs/compliance/` |
| 11 | Cookie Notice | `/cookies` | Published draft. **Open issue:** `gd_ref` attribution cookie classification (see source register) |
| — | Data Retention Schedule | `/data-retention` | Published draft |

## Drafts in this folder

| # | Document | File |
|---|---|---|
| 2 | Customer Terms | `customer-terms.md` |
| 3 | Organizer Terms | `organizer-terms.md` |
| 4 | Provider Marketplace Terms | `provider-marketplace-terms.md` |
| 5 | Venue Marketplace Terms | `venue-marketplace-terms.md` |
| 7 | Official Ticket Resale Terms | `ticket-resale-terms.md` |
| 8 | Marketplace Payment Protection Terms | `payment-protection-terms.md` |
| 9 | Cancellation & Refund Policy | `cancellation-refund-policy.md` |
| 12 | Data Processing Addendum | `data-processing-addendum.md` |
| 13 | Acceptable Use Policy | `acceptable-use-policy.md` |
| 14 | Community & Marketplace Standards | `community-standards.md` |
| 15 | Content & Template Policy | `content-template-policy.md` |
| 16 | Accessibility Statement | `accessibility-statement.md` |
| 17 | Safeguarding & Abuse Policy | `safeguarding-policy.md` |
| 18 | Complaints Policy | `complaints-policy.md` |
| 19 | Intellectual Property & Takedown Procedure | `ip-takedown.md` |
| 20 | Affiliate & Partner Terms | `partner-terms.md` |
| 21 | Promoter Terms | `promoter-terms.md` |
| 22 | AI / Gala Agent Terms & Disclosures | `ai-terms.md` |
| — | Legal source register | `source-register.md` |

## Drafting conventions

* Plain English, second person. "We" means Blackwellen Ltd.
* Every statement about how the product works must match the code. Where a document describes a mechanism (payment protection, refunds, resale caps, break-glass access, AI approvals), the controlling implementation is named in the source register so counsel and engineering can check them together.
* Consumer documents must not exclude liability that cannot lawfully be excluded under the Consumer Rights Act 2015 and must keep statutory rights intact.
