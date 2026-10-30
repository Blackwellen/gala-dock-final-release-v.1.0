import type { Metadata } from "next";
import "@/styles/kit.css";
import "@/styles/customer.css";
import "@/styles/cu-public-event.css";
import "@/styles/cu-guest-forms.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";
import { SiteFooter } from "@/components/public/site-footer";
import "@/styles/pub-directory.css";

// Anonymous token pages (W09 pattern): never indexed, the token never leaves in a Referer header, always rendered per request.
export const metadata: Metadata = { title: { default: "RSVP · Gala Dock", template: "%s · Gala Dock" }, robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function RsvpLayout({ children }: { children: React.ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root"><PublicHeader /><main className="c-main pub-main">{children}</main><SiteFooter /></div></KitProviders>;
}
