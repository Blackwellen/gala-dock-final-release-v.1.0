"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, RotateCcw, UserPlus, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { resolveErrorIncident, assignErrorIncident } from "../actions";
import { retryFromIncident } from "./actions";
import type { ErrorIncidentRow } from "@/lib/automations/data";

type Tab = "overview" | "logs" | "related-runs" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "logs", label: "Logs" },
  { id: "related-runs", label: "Related Runs" },
  { id: "history", label: "History" },
];

// Any object key that looks like it might carry a secret gets its value
// masked before rendering — applied to stack traces (as plain text) and
// payload previews (as structured JSON) shown in the incident detail panel.
const SENSITIVE_KEY_PATTERN = /(key|secret|token|password|authorization|api[_-]?key|bearer|credential)/i;

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "••••••" : redactSensitive(v);
    }
    return out;
  }
  return value;
}

function redactText(text: string): string {
  // Masks obvious "key: value" / "key=value" pairs where the key name looks
  // like a secret — a plain-text equivalent of redactSensitive() for stack
  // traces, which aren't structured JSON.
  return text.replace(
    /((?:api[_-]?key|secret|token|password|authorization|bearer|credential)\s*[:=]\s*)([^\s,;"']+)/gi,
    "$1••••••"
  );
}

function severityBadgeStatus(sev: string) {
  if (sev === "critical") return "critical" as const;
  if (sev === "warning") return "warning" as const;
  return "info-severity" as const;
}

function runStatusBadgeNode(status: string) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border bg-success-50 text-success-700 border-success-200">
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
        Success
      </span>
    );
  }
  const mapped = status === "waiting_approval" ? "waiting-approval" : status;
  return <StatusBadge status={mapped as Parameters<typeof StatusBadge>[0]["status"]} />;
}

export function ErrorsClient({
  incident,
  occurrences,
  relatedRuns,
  ownerLabel,
  currentUserId,
}: {
  incident: ErrorIncidentRow | null;
  occurrences: { id: string; occurredAt: string; message: string | null; runId: string | null }[];
  relatedRuns: { id: string; status: string; ts: string }[];
  ownerLabel: string | null;
  currentUserId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"retry" | "assign" | "resolve" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (!incident) {
    return (
      <aside className="w-full xl:w-[380px] shrink-0">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card h-full">
          <EmptyState
            title="No error selected"
            description="Click an error title in the table to inspect its stack trace, payload and related runs here."
            compact
          />
        </div>
      </aside>
    );
  }

  function closePanel() {
    const params = new URLSearchParams(window.location.search);
    params.delete("error");
    const s = params.toString();
    router.push(`/event-manager/automations/errors${s ? `?${s}` : ""}`);
  }

  function doRetry() {
    setPendingAction("retry");
    startTransition(async () => {
      const res = await retryFromIncident(incident!.id);
      setPendingAction(null);
      if (res.ok && res.newRunId) {
        setToast(`Retry queued as run ${res.newRunId.slice(0, 8)}`);
        router.push(`/event-manager/automations/runs?run=${res.newRunId}`);
      } else {
        setToast(res.error ?? "Retry failed");
      }
    });
  }

  function assignToMe() {
    setPendingAction("assign");
    startTransition(async () => {
      const res = await assignErrorIncident(incident!.id, currentUserId);
      setPendingAction(null);
      setToast(res.ok ? "Assigned to you" : res.error ?? "Assign failed");
      router.refresh();
    });
  }

  function markResolved() {
    setPendingAction("resolve");
    startTransition(async () => {
      const res = await resolveErrorIncident(incident!.id);
      setPendingAction(null);
      setToast(res.ok ? "Marked resolved" : res.error ?? "Resolve failed");
      router.refresh();
    });
  }

  const redactedPayload = incident.payloadPreview ? (redactSensitive(incident.payloadPreview) as Record<string, unknown>) : null;
  const redactedStack = incident.stackTrace ? redactText(incident.stackTrace) : null;

  return (
    <aside className="w-full xl:w-[380px] shrink-0">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden sticky top-4">
        <div className="p-4 border-b border-surface-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-surface-900 truncate">{incident.title}</h3>
              <p className="text-xs text-surface-400 font-mono mt-0.5">{incident.id}</p>
            </div>
            <button onClick={closePanel} className="text-surface-400 hover:text-surface-600 shrink-0" aria-label="Close error details">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={severityBadgeStatus(incident.severity)} />
            <span className="text-xs text-surface-400">
              First seen {formatDate(incident.firstSeenAt, { hour: "2-digit", minute: "2-digit" })} · {incident.occurrences} occurrence
              {incident.occurrences === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={doRetry}
              disabled={isPending || !incident.automationId}
              title={!incident.automationId ? "No linked automation to retry" : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {isPending && pendingAction === "retry" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Retry Now
            </button>
            {incident.automationId && (
              <Link
                href={`/event-manager/automations/builder/${incident.automationId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Canvas
              </Link>
            )}
            <button
              onClick={assignToMe}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 disabled:opacity-60 transition-colors"
            >
              {isPending && pendingAction === "assign" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Assign to me
            </button>
            {incident.status !== "resolved" && (
              <button
                onClick={markResolved}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-success-200 bg-success-50 text-success-700 text-xs font-medium hover:bg-success-100 disabled:opacity-60 transition-colors"
              >
                {isPending && pendingAction === "resolve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Mark Resolved
              </button>
            )}
          </div>

          {toast && (
            <div className="mt-2 text-xs px-2.5 py-1.5 rounded-lg bg-surface-100 text-surface-700 flex items-center justify-between">
              <span>{toast}</span>
              <button onClick={() => setToast(null)} className="text-surface-400 hover:text-surface-600">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3 border-b border-surface-200 text-xs">
          <div>
            <p className="text-surface-400">Module</p>
            <p className="font-medium text-surface-800 capitalize">{incident.module}</p>
          </div>
          <div>
            <p className="text-surface-400">Impact</p>
            <p className="font-medium text-surface-800 capitalize">{incident.impact}</p>
          </div>
          <div>
            <p className="text-surface-400">Owner</p>
            <p className="font-medium text-surface-800">{ownerLabel ?? "Unassigned"}</p>
          </div>
          <div>
            <p className="text-surface-400">Status</p>
            <p className="font-medium text-surface-800 capitalize">{incident.status}</p>
          </div>
        </div>

        <div className="flex overflow-x-auto border-b border-surface-200 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-surface-500 hover:text-surface-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 max-h-[520px] overflow-y-auto space-y-3">
          {tab === "overview" && (
            <>
              {incident.message && <p className="text-xs text-surface-600">{incident.message}</p>}
              <div className="text-xs">
                <p className="text-surface-400 mb-1">Failed node</p>
                <p className="font-mono text-surface-800">{incident.nodeType ?? incident.nodeId ?? "—"}</p>
              </div>
              <div className="text-xs">
                <p className="text-surface-400 mb-1">Linked automation</p>
                {incident.automationId ? (
                  <Link href={`/event-manager/automations/builder/${incident.automationId}`} className="text-brand-600 hover:text-brand-700 font-medium">
                    {incident.automationName}
                  </Link>
                ) : (
                  <p className="text-surface-500">No linked automation</p>
                )}
              </div>
              {redactedStack && (
                <div>
                  <p className="text-xs text-surface-400 mb-1">Stack trace</p>
                  <pre className="rounded-lg bg-surface-900 text-surface-100 p-3 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-56">
                    {redactedStack}
                  </pre>
                </div>
              )}
              {redactedPayload && (
                <div>
                  <p className="text-xs text-surface-400 mb-1">Payload preview</p>
                  <pre className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-56">
                    {JSON.stringify(redactedPayload, null, 2)}
                  </pre>
                </div>
              )}
              {incident.suggestedFix && (
                <div className="rounded-lg bg-brand-50 border border-brand-200 p-3">
                  <p className="text-xs font-medium text-brand-800 mb-1">Suggested fix</p>
                  <p className="text-xs text-brand-700">{incident.suggestedFix}</p>
                </div>
              )}
            </>
          )}

          {tab === "logs" && (
            <div className="space-y-2">
              {occurrences.length === 0 ? (
                <p className="text-xs text-surface-400">No individual occurrence log entries recorded.</p>
              ) : (
                occurrences.map((o) => (
                  <div key={o.id} className="rounded-lg border border-surface-200 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-surface-400">
                      <span>{formatDate(o.occurredAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      {o.runId && (
                        <Link href={`/event-manager/automations/runs?run=${o.runId}`} className="text-brand-600 hover:text-brand-700 font-medium">
                          View run
                        </Link>
                      )}
                    </div>
                    {o.message && <p className="text-xs text-surface-700 mt-1 break-words">{redactText(o.message)}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "related-runs" && (
            <div className="space-y-2">
              {relatedRuns.length === 0 ? (
                <p className="text-xs text-surface-400">No runs found for this automation around the incident window.</p>
              ) : (
                relatedRuns.map((r) => (
                  <Link
                    key={r.id}
                    href={`/event-manager/automations/runs?run=${r.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 p-2.5 hover:bg-surface-50 transition-colors"
                  >
                    <span className="text-xs font-mono text-surface-600">{r.id.slice(0, 8)}</span>
                    <span className="text-[11px] text-surface-400">{formatDate(r.ts, { hour: "2-digit", minute: "2-digit" })}</span>
                    {runStatusBadgeNode(r.status)}
                  </Link>
                ))
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-3">
              <p className="text-[11px] text-surface-400">
                No status-change audit log exists for incidents yet — showing the lifecycle timestamps recorded on this incident.
              </p>
              <ol className="space-y-3 border-l-2 border-surface-100 pl-3">
                <li>
                  <p className="text-xs font-medium text-surface-800">First seen</p>
                  <p className="text-[11px] text-surface-400">{formatDate(incident.firstSeenAt, { hour: "2-digit", minute: "2-digit" })}</p>
                </li>
                <li>
                  <p className="text-xs font-medium text-surface-800">Last seen</p>
                  <p className="text-[11px] text-surface-400">{formatDate(incident.lastSeenAt, { hour: "2-digit", minute: "2-digit" })}</p>
                </li>
                {incident.status === "resolved" && (
                  <li>
                    <p className="text-xs font-medium text-surface-800">Resolved</p>
                    <p className="text-[11px] text-surface-400">Marked resolved</p>
                  </li>
                )}
              </ol>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
