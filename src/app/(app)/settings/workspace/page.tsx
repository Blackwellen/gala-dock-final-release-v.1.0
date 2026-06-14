import { requireWorkspace } from "@/lib/workspace";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { WorkspaceForm } from "./WorkspaceForm";

export const metadata = { title: "Workspace Settings" };

export default async function WorkspaceSettingsPage() {
  const { workspace } = await requireWorkspace();

  return (
    <SettingsShell title="Workspace" description="Manage your workspace identity and configuration.">
      <WorkspaceForm
        initialName={workspace.name}
        slug={workspace.slug}
        initialTimezone={workspace.timezone}
      />
    </SettingsShell>
  );
}
