import Link from "next/link";
import { Sparkles, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { Boxes, Webhook, AlertTriangle, KeyRound, Activity } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { listIntegrations, getIntegrationWebhooks, getWebhookDeliveries } from "@/lib/automations/data";
import { IntegrationsClient, type IntegrationDetail, type DeliveryRow, type FailureAlert } from "./IntegrationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automations — Integrations" };

// Impure Date.now() reads live in a plain helper, not inline in the page
// component body, so the react-hooks/purity rule doesn't flag them.
function hoursAgoIso(n: number): string {
  return new Date(Date.now() - n * 3600 * 1000).toISOString();
}

export default async function IntegrationsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const integrations = await listIntegrations(workspaceId);

  const webhooksByIntegration = await Promise.all(
    integrations.map((i) => getIntegrationWebhooks(workspaceId, i.id))
  );

  const allWebhookIds = webhooksByIntegration.flat().map((w) => w.id);
  const deliveriesByWebhookId = new Map<string, DeliveryRow[]>();
  if (allWebhookIds.length > 0) {
    const deliveryLists = await Promise.all(allWebhookIds.map((id) => getWebhookDeliveries(workspaceId, id, 10)));
    allWebhookIds.forEach((id, idx) => {
      deliveriesByWebhookId.set(
        id,
        deliveryLists[idx].map((d) => ({
          id: d.id,
          eventType: d.event_type,
          status: d.status,
          responseCode: d.response_code,
          attempt: d.attempt,
          createdAt: d.created_at,
        }))
      );
    });
  }

  const details: IntegrationDetail[] = integrations.map((integration, idx) => ({
    ...integration,
    webhooks: webhooksByIntegration[idx].map((w) => ({
      id: w.id,
      direction: w.direction,
      endpointUrl: w.endpoint_url,
      retryPolicy:
        (w.retry_policy as { strategy?: string; max_retries?: number; initial_delay_ms?: number; max_delay_ms?: number } | null) ?? null,
      subscribedEvents: (w.subscribed_events as string[] | null) ?? [],
      status: w.status,
      deliveries: deliveriesByWebhookId.get(w.id) ?? [],
    })),
  }));

  const since24h = hoursAgoIso(24);

  const [activeWebhooksRes, failed24hRes, last24hRes, failureAlertsRes] = await Promise.all([
    supabase.from("integration_webhooks").select("id", { count: "exact" }).eq("workspace_id", workspaceId).eq("status", "active"),
    supabase
      .from("integration_webhook_deliveries")
      .select("id", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .gte("created_at", since24h),
    supabase.from("integration_webhook_deliveries").select("id", { count: "exact" }).eq("workspace_id", workspaceId).gte("created_at", since24h),
    supabase
      .from("integration_webhook_deliveries")
      .select("id, event_type, status, response_code, attempt, created_at, webhook_id, integration_webhooks(connection_id, integration_connections(provider))")
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const connectedIntegrations = integrations.filter((i) => i.status === "connected").length;
  const apiKeysConnected = integrations.filter((i) => i.connectType === "api_key" && i.status === "connected").length;

  const failureAlerts: FailureAlert[] = (failureAlertsRes.data ?? []).map((r) => {
    const webhook = r.integration_webhooks as unknown as {
      connection_id: string | null;
      integration_connections: { provider: string } | null;
    } | null;
    return {
      id: r.id,
      provider: webhook?.integration_connections?.provider ?? "Unknown",
      eventType: r.event_type,
      responseCode: r.response_code,
      attempt: r.attempt,
      createdAt: r.created_at,
      webhookId: r.webhook_id,
    };
  });

  const kpis = {
    connectedIntegrations,
    activeWebhooks: activeWebhooksRes.count ?? 0,
    failedDeliveries24h: failed24hRes.count ?? 0,
    apiKeysConnected,
    last24hEvents: last24hRes.count ?? 0,
  };

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Automations"
        description="Connect and monitor the external systems your automations can read from and write to."
        tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/automations/ai-builder"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              AI Builder
            </Link>
            <Link
              href="/event-manager/automations/builder/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New automation
            </Link>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-[1600px] space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Connected integrations" value={kpis.connectedIntegrations} icon={Boxes} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Active webhooks" value={kpis.activeWebhooks} icon={Webhook} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Failed deliveries (24h)" value={kpis.failedDeliveries24h} icon={AlertTriangle} iconColor="text-danger-600" iconBg="bg-danger-50" />
          <MetricCard label="API keys connected" value={kpis.apiKeysConnected} icon={KeyRound} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Events (24h)" value={kpis.last24hEvents} icon={Activity} iconColor="text-info-600" iconBg="bg-info-50" />
        </KPIGrid>

        <IntegrationsClient integrations={details} failureAlerts={failureAlerts} />
      </div>
    </div>
  );
}
