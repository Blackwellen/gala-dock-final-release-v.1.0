import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/kit.css";
import { BrandBar, LegalFooter } from "@/components/public/token-chrome";

// Payment status links carry a reference: never indexed and never sent in a Referer header.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Token-style page: logo-only bar (no site navigation or account context) and the slim legal footer. */
export default function PaymentsLayout({ children }: { children: ReactNode }) {
  return <><BrandBar />{children}<LegalFooter /></>;
}
