import type { ReactNode } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import "@/styles/cu-public-event.css";
import { KitProviders } from "@/components/kit/client";
import { BrandBar, LegalFooter } from "@/components/public/token-chrome";

export { metadata } from "../events/layout";

/** Pay links are token portals: logo-only bar (no site navigation or account context, so nothing about the payer leaks) and the slim legal footer. */
export default function PayLayout({ children }: { children: ReactNode }) {
  return <KitProviders><div className="c-root k-root"><BrandBar /><main className="c-main pub-main">{children}</main><LegalFooter /></div></KitProviders>;
}
