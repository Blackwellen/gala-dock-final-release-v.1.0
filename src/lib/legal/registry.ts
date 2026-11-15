// Legal sign-off 2026-11-15 (R3): the published legal pack. Single source for every document's slug, URL, version, audience and who
// must accept it. Pure (no imports, no I/O): tests load it directly, and the database mirror (public.legal_documents, migration
// 202611150101) is checked against it. Texts live in content/legal/<slug>.md and are compiled into texts.generated.ts by
// scripts/legal/build-texts.mjs. Publication dates and effective dates are set in the database when the pack is published after
// deploy (scripts/legal/publish-pack.mjs → legal_publish_pack): consumer documents take effect on publication; business documents
// 15 full days later (UK P2B Regulation art. 3(2)); documents for everyone take effect on publication for consumers and 15 days later
// for business users.

export type LegalAudience = "consumer" | "business" | "all";
/** Roles that accept documents. "customer" is every account; the others come from what the account owns or is (legal_user_roles). */
export type LegalRole = "customer" | "organiser" | "supplier" | "venue" | "partner" | "promoter";
export type LegalGroup = "General" | "Customers" | "Payments" | "Business" | "Policies";
/** Express terms confirmed with their own tick when the document is accepted (Terms §0.3, Payment Terms Schedule 1). */
export type ExpressTerm = { code: string; roles: LegalRole[]; label: string };

export type LegalDoc = {
  slug: string; title: string; href: string; group: LegalGroup;
  /** Stored with every acceptance (legal_acceptances.version) and shown as "Version <label>". */
  version: string; label: string;
  /** The version this one replaces ("—" if the document is new or was never published). */
  previous: string; previousPublished: boolean;
  audience: LegalAudience;
  accept: LegalRole[];
  express?: ExpressTerm[];
};

export const LEGAL_PACK = "2026-11-v3";
export const LEGAL_PACK_LABEL = "3.0";
export const BUSINESS_NOTICE_DAYS = 15;
export const BUSINESS_ROLES: LegalRole[] = ["organiser", "supplier", "venue", "partner", "promoter"];

export const LEGAL_DOCUMENTS: LegalDoc[] = [
  { slug: "terms", title: "Terms of Service", href: "/terms", group: "General", version: "gd-tos-3.0", label: "3.0", previous: "2026-10", previousPublished: true, audience: "all", accept: ["customer"] },
  { slug: "privacy", title: "Privacy Policy", href: "/privacy", group: "General", version: "gd-pp-3.0", label: "3.0", previous: "2026-10", previousPublished: true, audience: "consumer", accept: [] },
  { slug: "cookies", title: "Cookie Policy", href: "/cookies", group: "General", version: "gd-cp-3.0", label: "3.0", previous: "2026-10", previousPublished: true, audience: "consumer", accept: [] },
  { slug: "data-retention", title: "Data Retention Schedule", href: "/data-retention", group: "General", version: "gd-drs-3.0", label: "3.0", previous: "2026-10", previousPublished: true, audience: "consumer", accept: [] },
  { slug: "acceptable-use", title: "Acceptable Use and Online Safety Policy", href: "/legal/acceptable-use", group: "General", version: "gd-aup-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "all", accept: ["customer"] },
  { slug: "community-standards", title: "Community and Review Standards", href: "/legal/community-standards", group: "General", version: "gd-crs-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "all", accept: ["customer"] },
  { slug: "complaints", title: "Complaints Policy", href: "/legal/complaints", group: "General", version: "gd-cmp-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "all", accept: [] },
  { slug: "accessibility", title: "Accessibility Statement", href: "/accessibility", group: "General", version: "gd-acc-1.0", label: "1.0", previous: "draft 2026-11-11", previousPublished: true, audience: "consumer", accept: [] },
  { slug: "customer-terms", title: "Customer Terms", href: "/legal/customer-terms", group: "Customers", version: "gd-cus-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "consumer", accept: ["customer"] },
  { slug: "ticket-terms", title: "Ticket Terms", href: "/ticket-terms", group: "Customers", version: "gd-tt-3.0", label: "3.0", previous: "2026-10", previousPublished: true, audience: "consumer", accept: ["customer"] },
  { slug: "resale-terms", title: "Ticket Resale Terms", href: "/legal/resale-terms", group: "Customers", version: "gd-rs-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "consumer", accept: ["customer"] },
  { slug: "cancellation-refund-policy", title: "Cancellation and Refund Policy", href: "/legal/cancellation-refund-policy", group: "Customers", version: "gd-crp-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "consumer", accept: ["customer"] },
  { slug: "payment-terms", title: "Payment Terms", href: "/legal/payment-terms", group: "Payments", version: "gd-pt-1.1", label: "1.1", previous: "gd-pt-1.0-2026-11-11", previousPublished: false, audience: "business", accept: ["organiser", "supplier"],
    express: [{ code: "payment_terms", roles: ["organiser", "supplier"], label: "I accept the Payment Terms for my workspace, including reserves (clause 5), recovery from my Stripe balance and bank account (6.4), the hold limit and default rule (8) and the only grounds on which payouts can be paused (9)." }] },
  { slug: "disputes-policy", title: "Disputes Policy", href: "/legal/disputes-policy", group: "Payments", version: "gd-dr-1.1", label: "1.1", previous: "gd-dr-1.0-2026-11-11", previousPublished: false, audience: "all", accept: ["customer", "organiser", "supplier"],
    express: [{ code: "dispute_deadline_rules", roles: ["organiser", "supplier"], label: "For disputes with other businesses, I accept the deadline rules (Disputes Policy clause 8: deemed acceptance after 7 days, proof of filing within 14 days, lapse after 14 days) and business arbitration (clause 7)." }] },
  { slug: "standard-booking-terms", title: "Standard Booking Terms", href: "/legal/standard-booking-terms", group: "Payments", version: "gd-sbt-1.0", label: "1.0", previous: "—", previousPublished: false, audience: "all", accept: ["customer", "organiser", "supplier"] },
  { slug: "organiser-terms", title: "Organiser Terms", href: "/legal/organiser-terms", group: "Business", version: "gd-org-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "business", accept: ["organiser"],
    express: [{ code: "cancellation_fees", roles: ["organiser"], label: "I accept that if I cancel an event (other than for force majeure), I pay the 5% seller fee on tickets sold and an amount equal to the £1.00 booking fees refunded to buyers (Organiser Terms 4.3)." }] },
  { slug: "supplier-terms", title: "Supplier Terms", href: "/legal/supplier-terms", group: "Business", version: "gd-sup-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "business", accept: ["supplier"] },
  { slug: "venue-terms", title: "Venue Terms", href: "/legal/venue-terms", group: "Business", version: "gd-ven-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "business", accept: ["venue"] },
  { slug: "data-processing-addendum", title: "Data Processing Addendum", href: "/legal/data-processing-addendum", group: "Business", version: "gd-dpa-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "business", accept: ["organiser", "supplier"] },
  { slug: "subscription-terms", title: "Subscription and Credits Terms", href: "/legal/subscription-terms", group: "Business", version: "gd-sub-1.0", label: "1.0", previous: "—", previousPublished: false, audience: "business", accept: ["organiser", "supplier"] },
  { slug: "ai-terms", title: "AI Terms", href: "/legal/ai-terms", group: "Business", version: "gd-ai-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "business", accept: ["organiser", "supplier"] },
  { slug: "partner-terms", title: "Affiliate and Partner Terms", href: "/legal/partner-terms", group: "Business", version: "gd-ptn-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "business", accept: ["partner"] },
  { slug: "promoter-terms", title: "Promoter Terms", href: "/legal/promoter-terms", group: "Business", version: "gd-pro-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "business", accept: ["promoter"] },
  { slug: "content-template-policy", title: "Content and Template Policy", href: "/legal/content-template-policy", group: "Policies", version: "gd-ctp-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "all", accept: [] },
  { slug: "ip-takedown", title: "Intellectual Property and Takedown Procedure", href: "/legal/ip-takedown", group: "Policies", version: "gd-ip-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "all", accept: [] },
  { slug: "safeguarding", title: "Safeguarding and Abuse Policy", href: "/legal/safeguarding", group: "Policies", version: "gd-sg-3.0", label: "3.0", previous: "2026-10", previousPublished: false, audience: "consumer", accept: [] },
];

export const LEGAL_GROUPS: LegalGroup[] = ["General", "Customers", "Payments", "Business", "Policies"];
export const legalDoc = (slug: string) => LEGAL_DOCUMENTS.find(d => d.slug === slug);
/** The six documents with their own short URL (/terms …); every other document is served at /legal/<slug>. */
export const isShortUrl = (d: LegalDoc) => d.href !== `/legal/${d.slug}`;

/** Published dates for one document version, as the database holds them (legal_current_versions). */
export type Published = { version: string; published_at: string; effective_at: string; business_effective_at: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** The header status line for a document (Gigvora pattern: version + in-force wording, never a person's name). */
export function statusLine(doc: LegalDoc, pub: Published | null | undefined, now = new Date()): string {
  if (!pub || pub.version !== doc.version) return "Publication pending";
  const business = Date.parse(pub.business_effective_at), t = now.getTime();
  if (doc.audience === "consumer") return `In force from ${day(pub.effective_at)}`;
  if (doc.audience === "business") return t >= business ? `In force from ${day(pub.business_effective_at)}`
    : `Published ${day(pub.published_at)} · applies to new users now and to existing business users from ${day(pub.business_effective_at)}`;
  return t >= business ? `In force from ${day(pub.effective_at)} (business users from ${day(pub.business_effective_at)})`
    : `In force from ${day(pub.effective_at)} · for existing business users from ${day(pub.business_effective_at)}`;
}
