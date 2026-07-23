import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { getPersonaContext } from "@/lib/flags/context";
import { upgradeMessage } from "@/lib/billing/entitlements";
import { aiConfigured } from "@/lib/ai/provider";
import { AiBuilderClient } from "./AiBuilderClient";

export const metadata = { title: "Automations — AI Builder" };
export const dynamic = "force-dynamic";

export default async function AiBuilderPage() {
  const { flags, workspaceName } = await getPersonaContext();

  if (!flags.automationsBuilder) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Automations" tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />} />
        <div className="max-w-lg mx-auto mt-10 rounded-xl border border-surface-200 bg-white p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-surface-900 mb-1">AI Builder</h2>
          <p className="text-sm text-surface-500 mb-5">{upgradeMessage("business")}</p>
          <Link
            href="/event-manager/settings/billing"
            className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Automations" tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />} />
      <AiBuilderClient aiModelAvailable={aiConfigured()} workspaceName={workspaceName} />
    </div>
  );
}
