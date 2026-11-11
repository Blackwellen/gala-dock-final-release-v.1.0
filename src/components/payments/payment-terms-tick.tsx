"use client";

/**
 * DEC-107 express term at payout set-up (playbook §4): the key Payment Terms in full, the version, and a separate tick. Shown
 * when /api/payouts answers 409 termsRequired; the acceptance is recorded server-side (accept_payment_terms: version, user, time).
 */
export function PaymentTermsTick({ version, checked, onChange }: { version: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="pt-tick" role="group" aria-labelledby="pt-tick-title" style={{ border: "1px solid var(--line, #e3e5ee)", borderRadius: 12, padding: "12px 14px", margin: "10px 0", fontSize: 14, lineHeight: 1.5 }}>
    <b id="pt-tick-title">Gala Dock Payment Terms for sellers <span className="muted">(version {version})</span></b>
    <ul style={{ margin: "6px 0 8px 18px", padding: 0 }}>
      <li>Customers pay you directly into your own Stripe account. Gala Dock’s fee is taken from each payment as an application fee.</li>
      <li>Payouts to your bank are manual: each payment is released when its trigger is met — the event has finished and the review window (24 hours) has passed, the customer confirms, you and the customer settle, an independent award is entered, or the payment provider’s hold limit is reached.</li>
      <li>A reserve may stay in your own Stripe balance only under the published rules: 10% for 30 days while you are new (first 90 days or £2,000 of releases), or up to 50% for up to 60 days if chargebacks exceed 0.75% or refunds exceed 10% over 90 days. Never for suspicion alone.</li>
      <li>Gala Dock can pause payouts only for a court order, a regulator or law-enforcement request, the payment provider’s instruction, sanctions screening, your insolvency or your own request — with a recorded reference.</li>
      <li>Refunds and chargebacks on your sales come out of your Stripe balance; Stripe may debit your bank for a negative balance.</li>
    </ul>
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>I accept the Gala Dock Payment Terms (version {version}) for this workspace. <a href="/terms" target="_blank" rel="noreferrer">Read the full terms</a></span>
    </label>
  </div>;
}

/** DEC-107 express term at the customer's first payment: who you pay, the fee rule and how disputes work, with its version. */
export function CustomerTermsTick({ version, checked, onChange }: { version: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="pt-tick" role="group" aria-labelledby="ct-tick-title" style={{ border: "1px solid var(--line, #e3e5ee)", borderRadius: 12, padding: "12px 14px", margin: "10px 0", fontSize: 14, lineHeight: 1.5 }}>
    <b id="ct-tick-title">Payment terms <span className="muted">(version {version})</span></b>
    <ul style={{ margin: "6px 0 8px 18px", padding: 0 }}>
      <li>You pay the organiser, venue or supplier directly through Stripe; they are the seller. Gala Dock does not hold your money.</li>
      <li>Prices include VAT. Gala Dock’s booking fee is part of the total and is refunded if the seller cancels, or where the law requires it.</li>
      <li>Refunds follow the seller’s cancellation policy shown before you pay, back to your original payment method.</li>
      <li>If something goes wrong, Gala Dock can help and recommend, but doesn’t decide: you and the seller settle, or use independent resolution or court. Card chargebacks stay open to you.</li>
    </ul>
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>I accept these payment terms (version {version}). <a href="/terms" target="_blank" rel="noreferrer">Full terms</a></span>
    </label>
  </div>;
}

export type TraderValue = { status: "business" | "non_trader"; form: string };
const FORMS: [string, string][] = [["sole_trader", "Sole trader"], ["freelancer", "Freelancer"], ["partnership", "Partnership"], ["company", "Company"], ["charity", "Charity or club"], ["other_business", "Other business"]];

/** Seller trader status (consumer law): asked once before payout set-up; defaults to "As a business". */
export function TraderQuestion({ version, value, onChange }: { version: string; value: TraderValue; onChange: (v: TraderValue) => void }) {
  return <fieldset className="pt-tick" style={{ border: "1px solid var(--line, #e3e5ee)", borderRadius: 12, padding: "12px 14px", margin: "10px 0", fontSize: 14, lineHeight: 1.5 }}>
    <legend><b>How do you sell on Gala Dock?</b> <span className="muted">(declaration {version})</span></legend>
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="trader" checked={value.status === "business"} onChange={() => onChange({ ...value, status: "business" })} />
      <span>As a business: sole trader, freelancer, partnership or company</span></label>
    {value.status === "business" && <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 6px 24px" }}><span>Type</span>
      <select value={value.form} onChange={e => onChange({ ...value, form: e.target.value })}>{FORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="trader" checked={value.status === "non_trader"} onChange={() => onChange({ ...value, status: "non_trader" })} />
      <span>As a private individual, not as a business (for example a one-off personal event). Buyers will be told that consumer protection law doesn’t apply to purchases from you.</span></label>
  </fieldset>;
}

/** Shown to buyers before paying a seller who declared they are not a trader. */
export function NonTraderNotice({ seller }: { seller: string }) {
  return <p role="note" style={{ border: "1px solid #e8b15a", background: "#fff7e8", borderRadius: 10, padding: "8px 12px", fontSize: 14, margin: "8px 0" }}>
    <b>{seller} is selling as a private individual, not a business.</b> Consumer protection law (for example your rights if a service isn’t as described) doesn’t apply to this purchase in the same way. Gala Dock’s payment terms and the seller’s refund policy still apply.
  </p>;
}
