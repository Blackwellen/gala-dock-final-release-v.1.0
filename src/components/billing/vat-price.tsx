import { vatIncText, vatMoney, vatSuffix } from "@/lib/billing/vat-display";

/**
 * A Gala Dock price with its VAT wording from src/lib/billing/vat-display.ts: "£49 a month + VAT" with "£58.80 inc. VAT" under it
 * when VAT is added, or just "£49 a month" when it isn't. Works in server and client components (no hooks).
 */
export function VatPrice({ minor, vatAdded, per, from, className }: { minor: number; vatAdded: boolean; per?: string; from?: boolean; className?: string }) {
  const inc = vatIncText(minor, vatAdded, from ? "From " : "");
  return <span className={className ? `vat-price ${className}` : "vat-price"}>
    <span className="vat-ex">{from ? "From " : ""}{vatMoney(minor)}{per ? ` ${per}` : ""}{vatSuffix(vatAdded)}</span>
    {inc && <small className="vat-inc">{inc}</small>}
  </span>;
}
