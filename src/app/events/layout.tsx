import type { Metadata } from "next";
import "@/styles/kit.css";
import "@/styles/customer.css";
import "@/styles/cu-public-event.css";
import "@/styles/cu-public-listing.css";
import "@/styles/cu-plan-wizard.css";
import "@/styles/pub-directory.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";
import { SiteFooter } from "@/components/public/site-footer";

// Every public directory / event / profile / series / promo page gets the shared header and footer here (owner 2026-10-29),
// so new pages inherit them; pages must not render their own SiteFooter.

export const metadata: Metadata = { title: { default: "Gala Dock", template: "%s · Gala Dock" }, manifest: "/customer.webmanifest" };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root"><PublicHeader /><main className="c-main pub-main">{children}</main><SiteFooter /></div></KitProviders>;
}
