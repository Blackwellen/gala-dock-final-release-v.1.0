import type { ReactNode } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import "@/styles/pub-directory.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";
import { SiteFooter } from "@/components/public/site-footer";

/** Referral landing (consent before any referral cookie): the shared public header and footer. The page keeps its own noindex metadata and consent flow. */
export default function ReferralLayout({ children }: { children: ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root"><PublicHeader /><main className="c-main pub-main" id="main">{children}</main><SiteFooter /></div></KitProviders>;
}
