import type { Metadata } from "next";
import "@/styles/kit.css";
import "@/styles/customer.css";
import "@/styles/cu-public-event.css";
import "@/styles/cu-public-listing.css";
import "@/styles/cu-plan-wizard.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";

export const metadata: Metadata = { title: { default: "Gala Dock", template: "%s · Gala Dock" }, manifest: "/customer.webmanifest" };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root"><PublicHeader /><main className="c-main pub-main">{children}</main></div></KitProviders>;
}
