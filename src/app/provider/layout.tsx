import type { Metadata } from "next";
import "@/styles/workspace.css";
import "@/styles/provider.css";
import { ProviderShell } from "@/components/workspace/shell";
import { getProvider, capabilityLabel } from "@/lib/provider/context";
import { providerShellData } from "@/lib/provider/shell-data";
import { switchProviderWorkspace } from "./actions";

export const metadata: Metadata = { title: { template: "%s · Gala Dock Provider", default: "Provider · Gala Dock" }, robots: { index: false } };

export default async function ProviderLayout({ children }: LayoutProps<"/provider">) {
  const ctx = await getProvider();
  const shell = await providerShellData(ctx);
  return <ProviderShell
    workspace={{ name: ctx.workspace.name, capabilityLabel: capabilityLabel(ctx.workspace.capabilities), capabilities: ctx.workspace.capabilities, cover: ctx.workspace.cover_image }}
    user={{ name: ctx.userName, avatar: ctx.userAvatar }}
    counts={shell.counts} messages={shell.messages} notifications={shell.notifications}
    workspaces={ctx.workspaces} activeId={ctx.workspace.id} switchWorkspace={switchProviderWorkspace}>
    {children}
  </ProviderShell>;
}
