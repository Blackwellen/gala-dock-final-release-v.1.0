"use client";

export function PrintButton() {
  return <button type="button" className="pt-btn outline pr-doc-print" onClick={() => window.print()}>Print or save as PDF</button>;
}
