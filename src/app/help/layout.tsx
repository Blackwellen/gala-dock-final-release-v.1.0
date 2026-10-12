import type { ReactNode } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";

/** Public Help Centre: the same public header as the event and legal pages. Signed-in workspaces have their own in-shell copy. */
export default function HelpLayout({ children }: { children: ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root"><PublicHeader /><main id="main">{children}</main></div></KitProviders>;
}
