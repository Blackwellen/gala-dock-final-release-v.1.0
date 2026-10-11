/** Single source for the legal documents (/privacy, /terms, /ticket-terms, /cookies, /data-retention). Version matches profiles.terms_version. */
export const LEGAL = {
  version: "2026-10",
  effective: "11 October 2026",
  service: "Gala Dock",
  site: "galadock.com",
  /** Registered company details — fill in before relying on these documents as contractual notices. */
  entity: { name: "Gala Dock", number: "", address: "" },
  dpo: { name: "Jamahl Thomas", role: "Data Protection Officer" },
  contact: { privacy: "privacy@galadock.com", support: "support@galadock.com", legal: "legal@galadock.com" },
  ico: { name: "Information Commissioner’s Office", url: "https://ico.org.uk/make-a-complaint/", phone: "0303 123 1113" },
  law: "the laws of England and Wales",
} as const;

export const LEGAL_DOCS = [
  { href: "/terms", title: "Terms of Service" },
  { href: "/privacy", title: "Privacy Policy" },
  { href: "/ticket-terms", title: "Ticket Purchase & Resale Terms" },
  { href: "/cookies", title: "Cookie Policy" },
  { href: "/data-retention", title: "Data Retention Schedule" },
] as const;
