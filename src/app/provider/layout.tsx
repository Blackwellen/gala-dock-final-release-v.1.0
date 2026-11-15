import type { Metadata } from "next";
import "@/styles/workspace.css";
import "@/styles/provider.css";
import "@/styles/provider-pwa.css";
import { ProviderShell } from "@/components/workspace/shell";
import { getProvider, capabilityLabel } from "@/lib/provider/context";
import { providerShellData } from "@/lib/provider/shell-data";
import { switchProviderWorkspace } from "./actions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadPending, businessGate } from "@/lib/legal/published";
import { LegalUpdateBanner } from "@/components/legal/legal-update-banner";
import { RETURN_PATH_HEADER, safeNext } from "@/lib/redirects";

export const metadata: Metadata = { title: { template: "%s · Gala Dock Provider", default: "Provider · Gala Dock" }, robots: { index: false } };

export default async function ProviderLayout({ children }: LayoutProps<"/provider">) {
  const ctx = await getProvider();
  const [shell, legal, h] = await Promise.all([providerShellData(ctx), loadPending(), headers()]);
  // R3: once changed business terms apply (or for a role begun after publication), the workspace waits for acceptance.
  const here = safeNext(h.get(RETURN_PATH_HEADER), "/provider");
  if (businessGate(legal)) redirect(`/legal/updates?next=${encodeURIComponent(here)}`);
  return <ProviderShell
    workspace={{ name: ctx.workspace.name, capabilityLabel: capabilityLabel(ctx.workspace.capabilities), capabilities: ctx.workspace.capabilities, cover: ctx.workspace.cover_image }}
    user={{ name: ctx.userName, avatar: ctx.userAvatar }}
    counts={shell.counts} messages={shell.messages} notifications={shell.notifications}
    workspaces={ctx.allWorkspaces} activeId={ctx.workspace.id} switchWorkspace={switchProviderWorkspace} canManage={ctx.can.manage} canFinance={ctx.can.finance} canDesign={["owner","manager","member"].includes(ctx.role)}>
    <LegalUpdateBanner pending={legal} next={here} />{children}
  </ProviderShell>;
}
