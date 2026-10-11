"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return <button type="button" className="ws-btn primary qprint-btn" onClick={() => window.print()}><Printer aria-hidden="true" />Print / Save as PDF</button>;
}
