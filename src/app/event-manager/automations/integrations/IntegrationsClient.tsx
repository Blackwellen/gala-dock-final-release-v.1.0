"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Copy,
  RotateCw,
  Send,
  RefreshCw,
  Plus,
  X,
  Check,
  AlertTriangle,
  CheckCircle2,
  Webhook,
  KeyRound,
  Link2,
  ArrowLeftRight,
  Radio,
  HelpCircle,
  Trash2,
} from "lucide-react";
import { cn, formatRelative, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProviderMeta, CONNECTABLE_PROVIDERS } from "./provider-meta";
import { disconnectIntegration } from "../actions";
import {
  logTestDelivery,
  redeliverLastEvent,
  retryFailedDelivery,
  rotateWebhookSecret,
  addSubscribedEvent,
  removeSubscribedEvent,
  connectApiKeyIntegration,
} from "./actions";

export interface DeliveryRow {
  id: string;
  eventType: string;
  status: string;
  responseCode: number | null;
  attempt: number;
  createdAt: string;
}

export interface WebhookDetail {
  id: string;
  direction: string;
  endpointUrl: string | null;
  retryPolicy: { strategy?: string; max_retries?: number; initial_delay_ms?: number; max_delay_ms?: number } | null;
  subscribedEvents: string[];
  status: string;
  deliveries: DeliveryRow[];
}

export interface IntegrationDetail {
  id: string;
  provider: string;
  connectType: string;
  status: string;
  environment: string;
  secretLast4: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  webhooks: WebhookDetail[];
}

export interface FailureAlert {
  id: string;
  provider: string;
  eventType: string;
  responseCode: number | null;
  attempt: number;
  createdAt: string;
  webhookId: string;
}

const STATUS_BADGE_MAP: Record<string, "connected" | "disconnected" | "critical"> = {
  connected: "connected",
  disconnected: "disconnected",
  error: "critical",
};

const DELIVERY_STATUS_MAP: Record<string, "delivered" | "failed" | "rate-limited" | "pending"> = {
  delivered: "delivered",
  failed: "failed",
  rate_limited: "rate-limited",
  pending: "pending",
};

type Tab = "webhook" | "directions" | "apiKeys" | "oauth" | "fields";

const TABS: { key: Tab; label: string }[] = [
  { key: "webhook", label: "Webhook Setup" },
  { key: "directions", label: "Incoming / Outgoing" },
  { key: "apiKeys", label: "API Keys" },
  { key: "oauth", label: "OAuth Connections" },
  { key: "fields", label: "Field Mappings" },
];

// Impure Date.now() read lives in a plain helper, not inline in a component
// or useMemo body, so the react-hooks/purity rule doesn't flag it.
function hoursAgoMs(n: number): number {
  return Date.now() - n * 3600 * 1000;
}

export function IntegrationsClient({ integrations, failureAlerts }: { integrations: IntegrationDetail[]; failureAlerts: FailureAlert[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "oauth" | "api_key" | "coming_soon">("all");
  const [selectedId, setSelectedId] = useState<string | null>(integrations[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<Tab>("webhook");
  const [busy, setBusy] = useState<string | null>(null);
  const [rotated, setRotated] = useState<{ webhookId: string; secret: string } | null>(null);
  const [newEventInput, setNewEventInput] = useState("");
  const [showNewIntegration, setShowNewIntegration] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return integrations.filter((i) => {
      const meta = getProviderMeta(i.provider);
      const matchesSearch = search.trim() === "" || meta.label.toLowerCase().includes(search.trim().toLowerCase());
      const matchesType = typeFilter === "all" || i.connectType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [integrations, search, typeFilter]);

  const selected = integrations.find((i) => i.id === selectedId) ?? filtered[0] ?? null;
  const selectedMeta = selected ? getProviderMeta(selected.provider) : null;
  const primaryWebhook = selected?.webhooks.find((w) => w.direction === "outgoing") ?? selected?.webhooks[0] ?? null;

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleDisconnect() {
    if (!selected) return;
    if (!window.confirm(`Disconnect ${selectedMeta?.label ?? selected.provider}? Automations relying on this integration may stop working.`)) return;
    setBusy("disconnect");
    const res = await disconnectIntegration(selected.id);
    setBusy(null);
    if (res.ok) {
      notify(`${selectedMeta?.label ?? selected.provider} disconnected.`);
      refresh();
    } else {
      notify(res.error ?? "Could not disconnect integration");
    }
  }

  async function handleTestEvent() {
    if (!primaryWebhook) return;
    setBusy("test");
    const res = await logTestDelivery(primaryWebhook.id);
    setBusy(null);
    notify(res.ok ? "Demo delivery logged — connect real credentials to send live events." : res.error ?? "Could not log test delivery");
    if (res.ok) refresh();
  }

  async function handleRedeliver() {
    if (!primaryWebhook) return;
    setBusy("redeliver");
    const res = await redeliverLastEvent(primaryWebhook.id);
    setBusy(null);
    notify(res.ok ? "Last event redelivered (demo)." : res.error ?? "No previous delivery to redeliver");
    if (res.ok) refresh();
  }

  async function handleRotateSecret() {
    if (!primaryWebhook) return;
    setBusy("rotate");
    const res = await rotateWebhookSecret(primaryWebhook.id);
    setBusy(null);
    if (res.ok && res.secret) {
      setRotated({ webhookId: primaryWebhook.id, secret: res.secret });
      refresh();
    } else {
      notify(res.error ?? "Could not rotate secret");
    }
  }

  async function handleAddEvent() {
    if (!primaryWebhook || !newEventInput.trim()) return;
    setBusy("add-event");
    const res = await addSubscribedEvent(primaryWebhook.id, newEventInput.trim());
    setBusy(null);
    if (res.ok) {
      setNewEventInput("");
      refresh();
    } else {
      notify(res.error ?? "Could not add event");
    }
  }

  async function handleRemoveEvent(eventType: string) {
    if (!primaryWebhook) return;
    setBusy(`remove-${eventType}`);
    const res = await removeSubscribedEvent(primaryWebhook.id, eventType);
    setBusy(null);
    if (res.ok) refresh();
    else notify(res.error ?? "Could not remove event");
  }

  async function handleRetryDelivery(deliveryId: string) {
    setBusy(`retry-${deliveryId}`);
    const res = await retryFailedDelivery(deliveryId);
    setBusy(null);
    notify(res.ok ? "Retry logged (demo)." : res.error ?? "Could not retry delivery");
    if (res.ok) refresh();
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    notify("Copied to clipboard.");
  }

  // Integration health (last 24h) for the selected integration's webhooks.
  const health = useMemo(() => {
    if (!selected) return null;
    const since = hoursAgoMs(24);
    const deliveries = selected.webhooks.flatMap((w) => w.deliveries).filter((d) => new Date(d.createdAt).getTime() >= since);
    const total = deliveries.length;
    const delivered = deliveries.filter((d) => d.status === "delivered").length;
    const failed = deliveries.filter((d) => d.status === "failed").length;
    const rate = total > 0 ? Math.round((delivered / total) * 100) : null;
    return { total, delivered, failed, rate };
  }, [selected]);

  const activity24h = useMemo(() => {
    const since = hoursAgoMs(24);
    const all = integrations.flatMap((i) => i.webhooks.flatMap((w) => w.deliveries)).filter((d) => new Date(d.createdAt).getTime() >= since);
    return {
      sent: all.length,
      successful: all.filter((d) => d.status === "delivered").length,
      failed: all.filter((d) => d.status === "failed").length,
    };
  }, [integrations]);

  const alreadyConnectedProviders = new Set(integrations.filter((i) => i.status === "connected").map((i) => i.provider));

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-surface-900 text-white text-sm shadow-lg">{toast}</div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowNewIntegration(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New integration
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-4 items-start">
        {/* Left: integration list */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="p-3 border-b border-surface-100 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search integrations…"
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-surface-200 bg-white"
            >
              <option value="all">All types</option>
              <option value="oauth">OAuth</option>
              <option value="api_key">API key</option>
              <option value="coming_soon">Coming soon</option>
            </select>
          </div>
          <ul className="divide-y divide-surface-100 max-h-[560px] overflow-y-auto">
            {filtered.length === 0 && <li className="p-4 text-xs text-surface-400 text-center">No integrations match.</li>}
            {filtered.map((i) => {
              const meta = getProviderMeta(i.provider);
              const active = selected?.id === i.id;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(i.id);
                      setActiveTab("webhook");
                      setRotated(null);
                    }}
                    className={cn("w-full text-left p-3 flex items-center gap-3 transition-colors", active ? "bg-brand-50" : "hover:bg-surface-50")}
                  >
                    <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", meta.bg, meta.text)}>
                      {meta.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-surface-900 truncate">{meta.label}</span>
                      </span>
                      <span className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <StatusBadge status={STATUS_BADGE_MAP[i.status] ?? "disconnected"} className="text-[10px] px-1.5 py-0" />
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-500 capitalize">{i.environment}</span>
                      </span>
                      <span className="block text-[10px] text-surface-400 mt-1">
                        {i.lastSyncAt ? `Synced ${formatRelative(i.lastSyncAt)}` : "Never synced"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Main panel */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {!selected || !selectedMeta ? (
            <EmptyState icon={Webhook} title="No integration selected" description="Choose an integration from the list to view its configuration." />
          ) : (
            <>
              <div className="p-5 border-b border-surface-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0", selectedMeta.bg, selectedMeta.text)}>
                      {selectedMeta.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-surface-900">{selectedMeta.label}</h3>
                        <StatusBadge status={STATUS_BADGE_MAP[selected.status] ?? "disconnected"} />
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-100 text-surface-500 capitalize">{selected.environment}</span>
                      </div>
                      <p className="text-xs text-surface-500 mt-1">{selectedMeta.description}</p>
                    </div>
                  </div>
                  {selected.status === "connected" && (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={busy === "disconnect"}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger-600 border border-danger-200 rounded-lg hover:bg-danger-50 transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  )}
                </div>
                {selected.secretLast4 && (
                  <p className="text-[11px] text-surface-400 mt-3">
                    Credential on file ending in <span className="font-mono text-surface-600">•••• {selected.secretLast4}</span>
                    {selected.connectedAt && <> · connected {formatDate(selected.connectedAt)}</>}
                  </p>
                )}
              </div>

              <div className="px-5 border-b border-surface-100 flex gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      "px-3 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                      activeTab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-700"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {activeTab === "webhook" && (
                  <WebhookSetupTab
                    webhook={primaryWebhook}
                    busy={busy}
                    rotated={rotated}
                    newEventInput={newEventInput}
                    setNewEventInput={setNewEventInput}
                    onTest={handleTestEvent}
                    onRedeliver={handleRedeliver}
                    onRotate={handleRotateSecret}
                    onAddEvent={handleAddEvent}
                    onRemoveEvent={handleRemoveEvent}
                    onCopy={copy}
                  />
                )}
                {activeTab === "directions" && <DirectionsTab webhooks={selected.webhooks} onCopy={copy} />}
                {activeTab === "apiKeys" && <ApiKeysTab integrations={integrations} onSaved={refresh} notify={notify} />}
                {activeTab === "oauth" && <OAuthTab integrations={integrations.filter((i) => i.connectType === "oauth")} />}
                {activeTab === "fields" && (
                  <EmptyState
                    icon={ArrowLeftRight}
                    compact
                    title="No field mappings configured"
                    description="Field-level mapping between Gala Dock records and this provider's schema isn't set up for this integration yet."
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Right insights */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Integration health</h3>
            {!selected ? (
              <p className="text-xs text-surface-400">Select an integration to see its health.</p>
            ) : !health || health.total === 0 ? (
              <p className="text-xs text-surface-400">No deliveries in the last 24 hours for {selectedMeta?.label}.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">Success rate (24h)</span>
                  <span className={cn("font-semibold tabular-nums", (health.rate ?? 0) >= 90 ? "text-success-600" : (health.rate ?? 0) >= 60 ? "text-warning-600" : "text-danger-600")}>
                    {health.rate}%
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-surface-500">
                  <span>{health.total} sent</span>
                  <span className="text-success-600">{health.delivered} ok</span>
                  <span className="text-danger-600">{health.failed} failed</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Failure alerts</h3>
            {failureAlerts.length === 0 ? (
              <p className="text-xs text-surface-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success-600 shrink-0" /> No failed deliveries logged.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {failureAlerts.map((a) => {
                  const meta = getProviderMeta(a.provider);
                  return (
                    <li key={a.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-surface-900 truncate">{meta.label}</p>
                        <p className="text-[11px] text-surface-500 truncate">{a.eventType}{a.responseCode ? ` · HTTP ${a.responseCode}` : ""}</p>
                        <p className="text-[10px] text-surface-400">{formatRelative(a.createdAt)} · attempt {a.attempt}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRetryDelivery(a.id)}
                        disabled={busy === `retry-${a.id}`}
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Integration activity (24h)</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-surface-900 tabular-nums">{activity24h.sent}</p>
                <p className="text-[10px] text-surface-400 uppercase tracking-wide">Sent</p>
              </div>
              <div>
                <p className="text-lg font-bold text-success-600 tabular-nums">{activity24h.successful}</p>
                <p className="text-[10px] text-surface-400 uppercase tracking-wide">OK</p>
              </div>
              <div>
                <p className="text-lg font-bold text-danger-600 tabular-nums">{activity24h.failed}</p>
                <p className="text-[10px] text-surface-400 uppercase tracking-wide">Failed</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-2 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-surface-400" />
              Need help?
            </h3>
            <p className="text-xs text-surface-500">
              Check recent run failures in{" "}
              <a href="/event-manager/automations/errors" className="text-brand-600 hover:text-brand-700 font-medium">
                Errors
              </a>{" "}
              or review automation activity in{" "}
              <a href="/event-manager/automations/runs" className="text-brand-600 hover:text-brand-700 font-medium">
                Runs &amp; Logs
              </a>
              . API keys and webhook secrets are never shown in full after creation — only the last 4 characters are stored.
            </p>
          </div>
        </div>
      </div>

      {showNewIntegration && (
        <NewIntegrationModal
          alreadyConnected={alreadyConnectedProviders}
          onClose={() => setShowNewIntegration(false)}
          onConnected={() => {
            setShowNewIntegration(false);
            refresh();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

// ── Webhook Setup tab ───────────────────────────────────────────────────────

function WebhookSetupTab({
  webhook,
  busy,
  rotated,
  newEventInput,
  setNewEventInput,
  onTest,
  onRedeliver,
  onRotate,
  onAddEvent,
  onRemoveEvent,
  onCopy,
}: {
  webhook: WebhookDetail | null;
  busy: string | null;
  rotated: { webhookId: string; secret: string } | null;
  newEventInput: string;
  setNewEventInput: (v: string) => void;
  onTest: () => void;
  onRedeliver: () => void;
  onRotate: () => void;
  onAddEvent: () => void;
  onRemoveEvent: (eventType: string) => void;
  onCopy: (text: string) => void;
}) {
  if (!webhook) {
    return (
      <EmptyState
        icon={Webhook}
        compact
        title="No webhook configured"
        description="This integration doesn't have a webhook set up yet."
      />
    );
  }

  const retry = webhook.retryPolicy;

  return (
    <div className="space-y-5">
      {webhook.endpointUrl && (
        <div>
          <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Endpoint URL</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 truncate">{webhook.endpointUrl}</code>
            <button type="button" onClick={() => onCopy(webhook.endpointUrl!)} className="p-2 rounded-lg border border-surface-200 hover:bg-surface-50">
              <Copy className="w-3.5 h-3.5 text-surface-500" />
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Signing secret</label>
        {rotated && rotated.webhookId === webhook.id ? (
          <div className="rounded-lg border border-warning-200 bg-warning-50 p-3">
            <p className="text-[11px] text-warning-700 font-medium mb-1.5">Copy this now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-warning-200 rounded-md px-2.5 py-1.5 truncate">{rotated.secret}</code>
              <button type="button" onClick={() => onCopy(rotated.secret)} className="p-1.5 rounded-md border border-warning-200 bg-white hover:bg-surface-50">
                <Copy className="w-3.5 h-3.5 text-warning-700" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 text-surface-400">••••••••••••••••••••••••</code>
            <button
              type="button"
              onClick={onRotate}
              disabled={busy === "rotate"}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 disabled:opacity-50"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Rotate
            </button>
          </div>
        )}
        <p className="text-[11px] text-surface-400 mt-1">Secrets are stored hashed — they can only ever be revealed once, immediately after rotation.</p>
      </div>

      <div>
        <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Retry policy</label>
        {retry ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-surface-50 border border-surface-200 p-2.5">
              <p className="text-sm font-semibold text-surface-900 tabular-nums">{retry.max_retries ?? "—"}</p>
              <p className="text-[10px] text-surface-400">Max retries</p>
            </div>
            <div className="rounded-lg bg-surface-50 border border-surface-200 p-2.5">
              <p className="text-sm font-semibold text-surface-900 tabular-nums">{retry.initial_delay_ms ? `${retry.initial_delay_ms}ms` : "—"}</p>
              <p className="text-[10px] text-surface-400">Initial delay</p>
            </div>
            <div className="rounded-lg bg-surface-50 border border-surface-200 p-2.5">
              <p className="text-sm font-semibold text-surface-900 tabular-nums">{retry.max_delay_ms ? `${Math.round(retry.max_delay_ms / 1000)}s` : "—"}</p>
              <p className="text-[10px] text-surface-400">Max delay</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-surface-400">No retry policy configured.</p>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Subscribed events</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {webhook.subscribedEvents.length === 0 && <span className="text-xs text-surface-400">No events subscribed.</span>}
          {webhook.subscribedEvents.map((ev) => (
            <span key={ev} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-100 text-surface-700 text-[11px] font-mono">
              {ev}
              <button type="button" onClick={() => onRemoveEvent(ev)} disabled={busy === `remove-${ev}`} className="hover:text-danger-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newEventInput}
            onChange={(e) => setNewEventInput(e.target.value)}
            placeholder="e.g. automation.run.succeeded"
            className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 font-mono"
          />
          <button
            type="button"
            onClick={onAddEvent}
            disabled={busy === "add-event" || !newEventInput.trim()}
            className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 disabled:opacity-50"
          >
            Add event
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onTest}
          disabled={busy === "test"}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          Send test event
        </button>
        <button
          type="button"
          onClick={onRedeliver}
          disabled={busy === "redeliver"}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Redeliver last event
        </button>
      </div>
      <p className="text-[11px] text-surface-400">
        Demo delivery logged — connect real credentials in Settings to send live events. No outbound network call is made for the seeded demo connections in this workspace.
      </p>

      <div>
        <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Recent deliveries</label>
        {webhook.deliveries.length === 0 ? (
          <p className="text-xs text-surface-400">No deliveries logged yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-surface-200">
            <table className="w-full text-xs">
              <thead className="bg-surface-50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-surface-500">Event</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-500">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-500">Code</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-500">Attempt</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-500">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {webhook.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 font-mono text-surface-700">{d.eventType}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={DELIVERY_STATUS_MAP[d.status] ?? "queued"} className="text-[10px] px-1.5 py-0" />
                    </td>
                    <td className="px-3 py-2 text-surface-500 tabular-nums">{d.responseCode ?? "—"}</td>
                    <td className="px-3 py-2 text-surface-500 tabular-nums">{d.attempt}</td>
                    <td className="px-3 py-2 text-surface-400">{formatRelative(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Incoming / Outgoing tab ────────────────────────────────────────────────

function DirectionsTab({ webhooks, onCopy }: { webhooks: WebhookDetail[]; onCopy: (text: string) => void }) {
  const incoming = webhooks.filter((w) => w.direction === "incoming");
  const outgoing = webhooks.filter((w) => w.direction === "outgoing");

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <h4 className="text-xs font-semibold text-surface-700 mb-2 flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-surface-400" /> Incoming ({incoming.length})
        </h4>
        {incoming.length === 0 ? (
          <p className="text-xs text-surface-400">No incoming webhooks configured.</p>
        ) : (
          <ul className="space-y-2">
            {incoming.map((w) => (
              <li key={w.id} className="rounded-lg border border-surface-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <StatusBadge status={w.status === "active" ? "active" : "inactive"} className="text-[10px] px-1.5 py-0" />
                </div>
                {w.endpointUrl && (
                  <button type="button" onClick={() => onCopy(w.endpointUrl!)} className="text-[11px] font-mono text-surface-600 hover:text-brand-600 truncate block">
                    {w.endpointUrl}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="text-xs font-semibold text-surface-700 mb-2 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-surface-400" /> Outgoing ({outgoing.length})
        </h4>
        {outgoing.length === 0 ? (
          <p className="text-xs text-surface-400">No outgoing webhooks configured.</p>
        ) : (
          <ul className="space-y-2">
            {outgoing.map((w) => (
              <li key={w.id} className="rounded-lg border border-surface-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <StatusBadge status={w.status === "active" ? "active" : "inactive"} className="text-[10px] px-1.5 py-0" />
                  <span className="text-[10px] text-surface-400">{w.subscribedEvents.length} events</span>
                </div>
                {w.endpointUrl && (
                  <button type="button" onClick={() => onCopy(w.endpointUrl!)} className="text-[11px] font-mono text-surface-600 hover:text-brand-600 truncate block">
                    {w.endpointUrl}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── API Keys tab ────────────────────────────────────────────────────────────

function ApiKeysTab({
  integrations,
  onSaved,
  notify,
}: {
  integrations: IntegrationDetail[];
  onSaved: () => void;
  notify: (msg: string) => void;
}) {
  const apiKeyIntegrations = integrations.filter((i) => i.connectType === "api_key");
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (apiKeyIntegrations.length === 0) {
    return <EmptyState icon={KeyRound} compact title="No API key integrations" description="Providers connected with an API key will appear here." />;
  }

  async function handleSave(provider: string) {
    if (value.trim().length < 6) {
      notify("API key looks too short");
      return;
    }
    setSaving(true);
    const res = await connectApiKeyIntegration(provider, value.trim());
    setSaving(false);
    if (res.ok) {
      setEditing(null);
      setValue("");
      notify("API key updated.");
      onSaved();
    } else {
      notify(res.error ?? "Could not update key");
    }
  }

  return (
    <ul className="space-y-3">
      {apiKeyIntegrations.map((i) => {
        const meta = getProviderMeta(i.provider);
        return (
          <li key={i.id} className="rounded-lg border border-surface-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0", meta.bg, meta.text)}>{meta.initials}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-900 truncate">{meta.label}</p>
                  <p className="text-[11px] text-surface-400 font-mono">
                    {i.secretLast4 ? `•••• ${i.secretLast4}` : "No key on file"}
                  </p>
                </div>
              </div>
              <StatusBadge status={STATUS_BADGE_MAP[i.status] ?? "disconnected"} className="text-[10px] px-1.5 py-0 shrink-0" />
            </div>
            {editing === i.provider ? (
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="password"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Paste new API key"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                />
                <button
                  type="button"
                  onClick={() => handleSave(i.provider)}
                  disabled={saving}
                  className="p-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setValue("");
                  }}
                  className="p-1.5 rounded-lg border border-surface-200 hover:bg-surface-50"
                >
                  <X className="w-3.5 h-3.5 text-surface-500" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditing(i.provider);
                  setValue("");
                }}
                className="mt-2 text-[11px] font-medium text-brand-600 hover:text-brand-700"
              >
                {i.status === "connected" ? "Rotate key" : "Connect with API key"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── OAuth tab ────────────────────────────────────────────────────────────────

function OAuthTab({ integrations }: { integrations: IntegrationDetail[] }) {
  if (integrations.length === 0) {
    return <EmptyState icon={Link2} compact title="No OAuth integrations" description="Providers connected via OAuth will appear here." />;
  }
  return (
    <div className="space-y-3">
      {integrations.map((i) => {
        const meta = getProviderMeta(i.provider);
        return (
          <div key={i.id} className="rounded-lg border border-surface-200 p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0", meta.bg, meta.text)}>{meta.initials}</span>
                <p className="text-sm font-medium text-surface-900 truncate">{meta.label}</p>
              </div>
              <StatusBadge status={STATUS_BADGE_MAP[i.status] ?? "disconnected"} className="text-[10px] px-1.5 py-0 shrink-0" />
            </div>
            {i.status === "connected" ? (
              <p className="text-[11px] text-surface-500">
                Connected {i.connectedAt ? formatDate(i.connectedAt) : ""} — read-only in this demo. Re-authorising requires a live OAuth app.
              </p>
            ) : (
              <p className="text-[11px] text-surface-400">
                OAuth setup requires connecting your own app credentials in Settings — not available in this demo.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── New integration modal ───────────────────────────────────────────────────

function NewIntegrationModal({
  alreadyConnected,
  onClose,
  onConnected,
  notify,
}: {
  alreadyConnected: Set<string>;
  onClose: () => void;
  onConnected: () => void;
  notify: (msg: string) => void;
}) {
  const options = CONNECTABLE_PROVIDERS.filter((p) => !alreadyConnected.has(p.value));
  const [provider, setProvider] = useState<string>(options[0]?.value ?? "custom");
  const [customName, setCustomName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedOption = options.find((o) => o.value === provider);
  const isOAuth = selectedOption?.connectType === "oauth";
  const isCustom = provider === "custom";
  const meta = !isCustom ? getProviderMeta(provider) : null;

  async function handleSubmit() {
    const providerValue = isCustom ? customName.trim().toLowerCase().replace(/\s+/g, "_") : provider;
    if (isCustom && !customName.trim()) {
      notify("Enter a provider name");
      return;
    }
    if (apiKey.trim().length < 6) {
      notify("API key looks too short");
      return;
    }
    setSubmitting(true);
    const res = await connectApiKeyIntegration(providerValue, apiKey.trim());
    setSubmitting(false);
    if (res.ok) {
      notify("Integration connected.");
      onConnected();
    } else {
      notify(res.error ?? "Could not connect integration");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-900">New integration</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-surface-100">
            <X className="w-4 h-4 text-surface-500" />
          </button>
        </div>

        <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full px-2.5 py-2 text-sm rounded-lg border border-surface-200 mb-4"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {getProviderMeta(o.value).label}
            </option>
          ))}
          <option value="custom">Custom provider…</option>
        </select>

        {isCustom && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Provider name</label>
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. mailgun"
              className="w-full px-2.5 py-2 text-sm rounded-lg border border-surface-200"
            />
          </div>
        )}

        {isOAuth ? (
          <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-700 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {meta?.label ?? "This provider"} uses OAuth. Connecting your own app credentials happens in Settings — a full OAuth flow isn&apos;t
              available in this demo.
            </span>
          </div>
        ) : (
          <>
            <label className="text-xs font-semibold text-surface-700 mb-1.5 block">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste API key"
              className="w-full px-2.5 py-2 text-sm rounded-lg border border-surface-200"
            />
            <p className="text-[11px] text-surface-400 mt-1.5">Only the last 4 characters are stored. The full key is never saved or shown again.</p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Connecting…" : "Connect"}
              </button>
            </div>
          </>
        )}

        {isOAuth && (
          <div className="flex items-center justify-end mt-5">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-surface-600 hover:text-surface-800">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
