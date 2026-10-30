import type { ReactNode } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import { KitProviders } from "@/components/kit/client";
import { PublicHeader } from "@/components/customer/public-header";
import { SiteFooter } from "@/components/public/site-footer";

/** The one Help Centre for everyone: the public header (signed-in visitors get their avatar) and the public footer. Workspace help
 *  routes redirect here. */
export default function HelpLayout({ children }: { children: ReactNode }) {
  return <KitProviders><div className="c-root k-root pub-root"><PublicHeader /><main id="main">{children}</main><SiteFooter /></div></KitProviders>;
}
