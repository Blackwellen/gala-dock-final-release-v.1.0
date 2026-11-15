import { LEGAL_DOCUMENTS, LEGAL_GROUPS, legalDoc } from "./legal/registry";

/** Operator identity and fee strings for the legal documents and the site. The documents themselves, their versions and who accepts
 *  them are in src/lib/legal/registry.ts (texts in content/legal/*.md). `version` is the Terms of Service version recorded at sign-up
 *  (profiles.terms_version → legal_acceptances via legal_record_signup_acceptance). No individual is named here or in any legal header:
 *  contact points use role wording ("our data protection lead") — owner instruction 2026-11-15, as on Gigvora. */
export const LEGAL = {
  version: legalDoc("terms")!.version,
  service: "Gala Dock",
  site: "galadock.com",
  /** Operator, per Companies House (company 16482166, registered in England and Wales). Gala Dock is a trading name. */
  entity: { name: "Blackwellen Limited", number: "16482166", address: "61 Bridge Street, Kington, Herefordshire, HR5 3DJ, United Kingdom", ico: "ZC160806", vat: "GB508480488" },
  /** Role-based contact point for data protection (UK GDPR Art 13(1)(b) is met by the contact route; no named officer). */
  dataProtection: { role: "our data protection lead", email: "legal@galadock.com" },
  contact: { privacy: "legal@galadock.com", support: "support@galadock.com", legal: "legal@galadock.com" },
  ico: { name: "Information Commissioner’s Office", url: "https://ico.org.uk/make-a-complaint/", phone: "0303 123 1113" },
  law: "the laws of England and Wales",
  /** Platform-usage fee schedule (mirrors the published commerce settings, migration 202610280005). */
  fees: {
    ticketBuyer: "£1.00 per paid ticket (including VAT)", ticketSeller: "5% of the face value of each ticket sold, plus VAT where it applies",
    supplier: "8% on Starter, 7% on Pro and 6% on Business or Enterprise plans, plus VAT where it applies", bookingAdmin: "2.5% of each booking payment (minimum £1), including VAT",
  },
  /** Gala Dock fees carry UK VAT at 20% (business fees plus VAT; consumer fees VAT-inclusive). Mirrors commerce setting `vat`. */
  vatRate: "20%",
  /** Business users' liability floor (Organizer, Provider, Venue and Partner terms). */
  liabilityFloor: "£1,000",
} as const;

/** Every published legal document, grouped for the legal index and the side navigation. */
export const LEGAL_DOCS = LEGAL_DOCUMENTS.map(d => ({ href: d.href, title: d.title, group: d.group }));
export const LEGAL_NAV = LEGAL_GROUPS.map(g => ({ group: g, docs: LEGAL_DOCS.filter(d => d.group === g) }));
