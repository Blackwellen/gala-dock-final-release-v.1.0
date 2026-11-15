/**
 * How Gala Dock's own prices show VAT: plans, credit packs and the provider platform fee, on /pricing and in-app billing.
 * The only place the "+ VAT" / "inc. VAT" wording lives (tests/e2e/public/pricing.spec.ts fails if "+ VAT" appears elsewhere in src).
 *
 * Owner decision 2026-11-15: when VAT is added (BILLING_AUTOMATIC_TAX on, which is how production launches) every price shows
 * the ex-VAT amount with "+ VAT" AND the VAT-inclusive amount at the UK standard rate, so consumers see the price they pay
 * (UK/EU consumer pricing rules) and businesses see the net price. When VAT is not added, no plan or pack price says "+ VAT".
 * Pure module (no server imports) so client components can use it.
 */

/** UK standard rate used for the displayed inc-VAT figure. Stripe Tax charges the buyer's actual rate at checkout. */
export const UK_VAT_RATE_PCT = 20;

/**
 * VAT on the provider platform fee (booking commission) is accounted on every direct charge (src/lib/payments/rules.ts
 * directChargeLines → tax_payable), independent of BILLING_AUTOMATIC_TAX, so the fee always shows "+ VAT". Owner to confirm.
 */
export const PLATFORM_FEE_VAT_ADDED = true;

/** Promotion boosts are invoiced with UK VAT as their own amount (Q56), also independent of BILLING_AUTOMATIC_TAX. */
export const BOOST_VAT_ADDED = true;

const SUFFIX = " + VAT";
const INC = "inc. VAT";
export const VAT_RATE_NOTE = "VAT shown at the UK rate; your invoice uses the rate for your country.";
const NOTE_ON = `Prices exclude VAT, which is added at checkout. ${VAT_RATE_NOTE}`;
const NOTE_OFF = "Plan and credit pack prices are what you pay; VAT isn’t added to them at the moment.";

/** The short note shown beside a price list. */
export const vatNote = (vatAdded: boolean) => (vatAdded ? NOTE_ON : NOTE_OFF);
/** " + VAT" when VAT is added, otherwise "". */
export const vatSuffix = (vatAdded: boolean) => (vatAdded ? SUFFIX : "");

/** Ex-VAT pennies → inc-VAT pennies at the UK rate, integer maths (half-up), e.g. 4900 → 5880. */
export function incVatMinor(minor: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new RangeError("incVatMinor: amount must be a non-negative integer of minor units");
  return Math.floor((minor * (100 + UK_VAT_RATE_PCT) + 50) / 100);
}

/** £ from pennies: whole pounds without decimals (£49), otherwise two decimals (£58.80). */
export function vatMoney(minor: number): string {
  const whole = minor % 100 === 0;
  return `£${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/** "£58.80 inc. VAT" (optionally "From £58.80 inc. VAT"), or null when VAT is not added. */
export function vatIncText(minor: number, vatAdded: boolean, prefix = ""): string | null {
  return vatAdded ? `${prefix}${vatMoney(incVatMinor(minor))} ${INC}` : null;
}

/** One-line form for text contexts: "£25 + VAT (£30 inc. VAT)", or "£25" when VAT is not added. */
export function vatPriceLine(minor: number, vatAdded: boolean, per = ""): string {
  const base = `${vatMoney(minor)}${per ? ` ${per}` : ""}`;
  return vatAdded ? `${base}${SUFFIX} (${vatIncText(minor, true)})` : base;
}

/** Percentage fee from basis points: "8% + VAT (9.6% inc. VAT)", or "8%" when VAT is not added. */
export function vatPercent(bps: number, vatAdded: boolean): string {
  const pct = (b: number) => `${(b / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
  return vatAdded ? `${pct(bps)}${SUFFIX} (${pct((bps * (100 + UK_VAT_RATE_PCT)) / 100)} ${INC})` : pct(bps);
}
