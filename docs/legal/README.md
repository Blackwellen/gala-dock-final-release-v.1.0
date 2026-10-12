# Gala Dock legal document pack

> **Approved for publication by Jamahl Thomas, Director, Blackwellen Limited, 12 October 2026.** These documents describe how the product actually behaves. They have not been reviewed by an external solicitor or barrister; an external review is recommended as the business grows.

**Operator:** Blackwellen Limited, trading as Gala Dock · Company number **16482166** · Registered office **61 Bridge Street, Kington, Herefordshire, HR5 3DJ** · VAT number **GB508480488** · ICO registration **ZC160806**

These placeholders must be completed from verified company records. `src/lib/legal.ts` holds the same fields for the published pages and currently leaves them empty.

## Published pages (in the app)

| # | Document | Location | Status |
|---|---|---|---|
| 1 | Platform Terms of Service | `/terms` | Published · approved 12 Oct 2026 |
| 6 | Ticket Purchase Terms (with resale summary) | `/ticket-terms` | Published · approved 12 Oct 2026 |
| 10 | Privacy Notice | `/privacy` | Published · approved 12 Oct 2026; DPIA for break-glass access in `docs/compliance/` |
| 11 | Cookie Notice | `/cookies` | Published · approved 12 Oct 2026. **Open issue:** `gd_ref` attribution cookie classification (see source register) |
| — | Data Retention Schedule | `/data-retention` | Published · approved 12 Oct 2026 |

## Documents in this folder (approved 12 October 2026)

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

* Plain English, second person. "We" means Blackwellen Limited.
* Every statement about how the product works must match the code. Where a document describes a mechanism (payment protection, refunds, resale caps, break-glass access, AI approvals), the controlling implementation is named in the source register so counsel and engineering can check them together.
* Consumer documents must not exclude liability that cannot lawfully be excluded under the Consumer Rights Act 2015 and must keep statutory rights intact.
