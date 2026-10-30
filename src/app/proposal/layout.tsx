import type { ReactNode } from "react";
import { BrandBar, LegalFooter } from "@/components/public/token-chrome";

/** Token portal chrome: logo only (no navigation or account context) and the slim legal footer. Pages keep their own noindex / no-referrer metadata. */
export default function TokenLayout({ children }: { children: ReactNode }) {
  return <><BrandBar />{children}<LegalFooter /></>;
}
