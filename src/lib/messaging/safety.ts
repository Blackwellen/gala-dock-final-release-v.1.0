// Q52 messaging safety helpers shared by the server actions and the composer (no server-only imports).

/** Reasons a person can report a message for: the `message` codes of public.moderation_reason_codes. */
export const REPORT_REASONS = [
  ["abusive_content", "Abusive, hateful or harassing"],
  ["scam_or_payment_diversion", "Scam, or asks me to pay outside Gala Dock"],
  ["off_platform", "Asks to move the conversation outside Gala Dock"],
  ["spam", "Spam or junk"],
  ["illegal_content", "Illegal content (threats, fraud, intimate images)"],
  ["child_safety", "A child may be at risk"],
  ["personal_data", "Shares someone’s personal data"],
  ["other_policy", "Something else (explain below)"],
] as const;

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]?){10,}/;
const OFF_PLATFORM = /\b(bank transfer|sort code|account number|iban|paypal|venmo|revolut|cash ?app|pay (?:you |me )?directly|pay (?:in )?cash|whats ?app|telegram|outside (?:of )?gala ?dock|off[- ]platform)\b/i;

/**
 * Non-circumvention nudge: true when a draft shares an email address or phone number, or suggests paying or talking outside
 * Gala Dock. Advisory only (the message still sends); the database risk scanner flags the same patterns for Trust & Safety.
 */
export function offPlatformHint(text: string): boolean {
  return EMAIL.test(text) || PHONE.test(text) || OFF_PLATFORM.test(text);
}
