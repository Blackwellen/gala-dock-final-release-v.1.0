/** Single source for the legal documents (/privacy, /terms, /ticket-terms, /cookies, /data-retention). Version matches profiles.terms_version. */
export const LEGAL = {
  version: "2026-10",
  effective: "12 October 2026",
  service: "Gala Dock",
  site: "galadock.com",
  /** Operator, per Companies House (company 16482166, registered in England and Wales). Gala Dock is a trading name. */
  entity: { name: "Blackwellen Limited", number: "16482166", address: "61 Bridge Street, Kington, Herefordshire, HR5 3DJ, United Kingdom", ico: "ZC160806", vat: "GB508480488" },
  dpo: { name: "Jamahl Thomas", role: "Data Protection Officer" },
  contact: { privacy: "legal@galadock.com", support: "support@galadock.com", legal: "legal@galadock.com" },
  ico: { name: "Information Commissioner’s Office", url: "https://ico.org.uk/make-a-complaint/", phone: "0303 123 1113" },
  law: "the laws of England and Wales",
  /** Platform-usage fee schedule (mirrors the published commerce settings, migration 202610280005). */
  fees: {
    ticketBuyer: "£1.00 per paid ticket", ticketSeller: "5% of the face value of each ticket sold",
    supplier: "8% on Starter, 7% on Pro and 6% on Business or Enterprise plans", bookingAdmin: "2.5% of each booking payment (minimum £1)",
  },
  /** Business users' liability floor (Organizer, Provider, Venue and Partner terms). */
  liabilityFloor: "£1,000",
} as const;

export const LEGAL_DOCS = [
  { href: "/terms", title: "Terms of Service" },
  { href: "/privacy", title: "Privacy Policy" },
  { href: "/ticket-terms", title: "Ticket Purchase & Resale Terms" },
  { href: "/cookies", title: "Cookie Policy" },
  { href: "/data-retention", title: "Data Retention Schedule" },
] as const;
