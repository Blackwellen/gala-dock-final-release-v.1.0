/**
 * Non-circumvention (owner decision D11, Q54 2026-11-14): for 12 months after a business user is first introduced to another user
 * through Gala Dock, they must not move a bookable engagement off the platform to avoid Gala Dock's fees. Carve-out: sellers who are
 * enquiry-only (their country isn't supported for Gala Dock payments, or they chose enquiry-only listings) agree payment directly —
 * that is allowed, but it has no Gala Dock payment protection or dispute process. Consumers are never bound (Terms v3 §4.8).
 * Pure module: copy used in-app (enquiry-only notes, checkout refusal, bookable listing pages) and mirrored in the legal texts.
 */
export const NON_CIRCUMVENTION_MONTHS = 12;

export const NON_CIRCUMVENTION_COPY = {
  /** For business users on bookable listings / quotes. */
  keepOnPlatform: `Keep bookings that start on Gala Dock on Gala Dock. For ${NON_CIRCUMVENTION_MONTHS} months after you’re introduced, business users must not take payment outside Gala Dock to avoid fees (Terms §4.8). Payments made outside Gala Dock aren’t covered by Gala Dock’s payment protection or disputes process.`,
  /** For buyers when a seller is enquiry-only (the carve-out). */
  enquiryOnlyBuyer: "This seller takes enquiries only through Gala Dock. If you agree to pay them directly, that payment isn’t covered by Gala Dock’s payment protection or disputes process — check who you’re paying before you pay.",
  /** For enquiry-only sellers. */
  enquiryOnlySeller: "Because this listing is enquiry-only, agreeing payment directly with clients is allowed and isn’t a breach of the Gala Dock fee rules. Gala Dock’s payment protection and disputes process don’t cover those payments.",
} as const;
