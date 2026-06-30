import { SettingsShell } from "@/components/settings/SettingsShell";
import { getPersonaContext } from "@/lib/flags/context";
import { getAiUsageSummary } from "./data";
import { AiSettingsClient } from "./AiSettingsClient";

export const dynamic = "force-dynamic";

export default async function AISettingsPage() {
  const { workspaceId, flags } = await getPersonaContext();
  let usage = null;
  if (workspaceId) {
    try {
      usage = await getAiUsageSummary(workspaceId);
    } catch {
      usage = null;
    }
  }

  return (
    <SettingsShell title="AI Settings" description="Manage Gala Copilot and AI-powered features in your workspace.">
      <AiSettingsClient usage={usage} copilotEnabled={flags.aiCopilot} />
    </SettingsShell>
  );
}
