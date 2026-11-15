// Q72 · Minimal message catalogue for the key flows (checkout, emails, legal notices). en-GB is the only language today and the
// source of truth; another locale is added as a sibling object with the same keys (tests/release/q72-i18n.spec.ts enforces parity).
// Owner/Gigvora alignment: English UI, no language switcher yet; profiles.language records the preference for later and for
// Gala Agent replies. Copy marked LEGAL lives here so counsel reviews one file (LEGAL REVIEW PENDING — not published wording).
// Pure module: client, server and tests.

const enGB = {
  // Checkout
  "checkout.currency_notice": "Prices are in {currencyName} ({currency}). Your card issuer may convert this and charge a fee.",
  "checkout.currency_short": "All prices in {currency}",
  "checkout.price_includes_tax": "Prices include {taxName} where it applies.",
  "checkout.price_excludes_tax": "Prices exclude {taxName}; any tax due is shown before you pay.",
  "checkout.times_in_zone": "Times are shown in the event's local time ({zone}).",
  "checkout.your_time": "{time} your time",
  // Consumer cancellation (LEGAL)
  "legal.cancel.ticket.uk": "Tickets for an event on a specific date are not covered by the 14-day cancellation right (Consumer Contracts Regulations 2013, reg. 28(1)(b)). The organiser's refund policy applies, and you get a refund if the event is cancelled.",
  "legal.cancel.ticket.eu": "Tickets for a leisure event on a specific date are not covered by the 14-day right of withdrawal (Consumer Rights Directive 2011/83/EU, art. 16(l)). The organiser's refund policy applies, and you get a refund if the event is cancelled.",
  "legal.cancel.ticket.other": "Tickets are for an event on a specific date. The organiser's refund policy applies, and you get a refund if the event is cancelled. Your local consumer law may give you further rights.",
  "legal.cancel.booking.uk": "Services booked for a specific date (such as catering or leisure services) are not covered by the 14-day cancellation right (reg. 28(1)(b)). Other services can be cancelled within 14 days; if you ask the supplier to start sooner you pay for what has been provided.",
  "legal.cancel.booking.eu": "Services booked for a specific date (such as catering or leisure services) are not covered by the 14-day right of withdrawal (art. 16(l)). Other services can be withdrawn from within 14 days; if you ask the supplier to start sooner you pay for what has been provided.",
  "legal.cancel.booking.other": "The supplier's cancellation terms apply. Your local consumer law may give you further rights.",
  "legal.cancel.heading": "Cancellation and refunds",
  // Tax wording (display only; tax_id_collection and commission VAT belong to Q74)
  "legal.tax.reverse_charge.eu": "Reverse charge: VAT to be accounted for by the recipient (Article 196, Council Directive 2006/112/EC).",
  "legal.tax.reverse_charge.uk": "Reverse charge: the customer must account for the VAT to HMRC.",
  "legal.tax.reverse_charge.other": "No VAT charged: the customer accounts for any tax due in their country.",
  // Age / alcohol / licensing
  "legal.alcohol.not_covered": "Gala Dock's alcohol rules cover {covered} only. For {country}, check the legal drinking age and licensing rules locally (general rule: {min}+).",
  "legal.alcohol.covered": "Alcohol may only be sold to people aged {min} or over in {country}.",
  "legal.resale.cap": "Resale price is capped at {pct}% of the face value for events in {country}.",
  // Emails
  "email.order.subject": "Your tickets for {event}",
  "email.order.when": "When: {when} ({zone})",
  "email.order.total": "Total paid: {total}",
  "email.reminder.subject": "Reminder: {event} starts {when}",
  // Distances
  "units.within": "Within {distance} of {place}",
} as const;

export type MessageKey = keyof typeof enGB;
export const MESSAGES: Readonly<Record<string, Readonly<Record<MessageKey, string>>>> = { "en-GB": enGB };
export const SUPPORTED_LOCALES = Object.keys(MESSAGES) as readonly string[];
export const DEFAULT_LOCALE = "en-GB";

/** BCP-47 for the document: a stored profile language ("en", "en-GB", "fr") → the nearest supported UI locale (en-GB today). */
export function resolveLocale(pref: string | null | undefined): string {
  const p = (pref ?? "").trim();
  if (SUPPORTED_LOCALES.includes(p)) return p;
  const base = p.split(/[-_]/)[0]?.toLowerCase();
  return SUPPORTED_LOCALES.find(l => l.split("-")[0] === base) ?? DEFAULT_LOCALE;
}

/** Looks up `key` for `locale` (falling back to en-GB) and fills {placeholders}. Missing variables stay visible as {name}. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}, locale: string = DEFAULT_LOCALE): string {
  const msg = MESSAGES[resolveLocale(locale)]?.[key] ?? enGB[key];
  return msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Languages Gala Agent can be asked to answer in (profiles.language); the UI stays en-GB. ISO 639-1 → English name. */
export const AGENT_LANGUAGES: Readonly<Record<string, string>> = {
  en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian", nl: "Dutch", pt: "Portuguese", pl: "Polish", sv: "Swedish", da: "Danish",
  nb: "Norwegian", fi: "Finnish", cs: "Czech", sk: "Slovak", hu: "Hungarian", ro: "Romanian", bg: "Bulgarian", el: "Greek", et: "Estonian", lv: "Latvian",
  lt: "Lithuanian", sl: "Slovenian", mt: "Maltese", ga: "Irish", ja: "Japanese", zh: "Chinese",
};
export const languageName = (code: string | null | undefined) => AGENT_LANGUAGES[(code ?? "").split(/[-_]/)[0]!.toLowerCase()] ?? "English";
