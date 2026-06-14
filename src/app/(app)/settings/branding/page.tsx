import { requireWorkspace } from "@/lib/workspace";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { BrandingForm } from "./BrandingForm";

export const metadata = { title: "Branding" };

export default async function BrandingSettingsPage() {
  const { workspace } = await requireWorkspace();

  const branding =
    workspace.branding && typeof workspace.branding === "object" && !Array.isArray(workspace.branding)
      ? (workspace.branding as Record<string, unknown>)
      : {};
  const initialColor =
    typeof branding.brand_color === "string" ? branding.brand_color : "#4F46E5";

  return (
    <SettingsShell title="Branding" description="Customise how your workspace looks to your team and clients.">
      <BrandingForm initialColor={initialColor} workspaceName={workspace.name} />
    </SettingsShell>
  );
}
