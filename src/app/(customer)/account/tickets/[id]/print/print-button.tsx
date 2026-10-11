"use client";

/** Opens the browser print dialog; print CSS hides everything but the ticket. */
export function PrintButton() {
  return <button type="button" className="tp-btn" onClick={() => window.print()}>Print ticket</button>;
}
