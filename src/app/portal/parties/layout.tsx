import type { Metadata } from "next";
import "@/styles/kit.css";
import "@/styles/org-eventops.css";
import { KitProviders } from "@/components/kit/client";

// Party portal (Q24): login-based, scoped to the caller's own party. Never indexed; no referrer.
export const metadata: Metadata = { title: { default: "Partner portal · Gala Dock", template: "%s · Gala Dock" }, robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function PartyPortalLayout({ children }: { children: React.ReactNode }) {
  return <KitProviders>{children}</KitProviders>;
}
