"use client";

import { Printer } from "lucide-react";

/**
 * Print / Save-as-PDF trigger for the BEO document.
 * Uses the browser print dialog — no PDF library. Hidden when printing.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
    >
      <Printer className="w-4 h-4" strokeWidth={2} />
      Print / Save PDF
    </button>
  );
}
