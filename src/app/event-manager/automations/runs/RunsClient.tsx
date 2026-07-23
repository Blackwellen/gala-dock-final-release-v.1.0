"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  X,
  RotateCcw,
  Repeat,
  MoreHorizontal,
  Download,
  Ban,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { retryRun, replayRun, cancelRun } from "../actions";
import type { RunDetail } from "@/lib/automations/data";

type Tab = "timeline" | "logs" | "payload" | "request-response" | "metadata";

const TABS: { id: Tab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "logs", label: "Logs" },
  { id: "payload", label: "Payload" },
  { id: "request-response", label: "Request / Response" },
  { id: "metadata", label: "Metadata" },
];

function StepStatusBadge({ success }: { success: boolean }) {
  return success ? <RunStatusBadge status="success" /> : <StatusBadge status="failed" dot={false} />;
}

function RunStatusBadge({ status }: { status: string }) {
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

export function RunsClient({
  detail,
  payload,
  mode,
  actionLabels,
  initiatorLabel,
}: {
  detail: RunDetail | null;
  payload: unknown;
  mode: string | null;
  actionLabels: Record<string, string>;
  initiatorLabel: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("timeline");
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"retry" | "replay" | "cancel" | null>(null);

  if (!detail) {
    return (
      <aside className="w-full xl:w-[380px] shrink-0">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card h-full">
          <EmptyState
            title="No run selected"
            description="Click “View” on any run in the Run History table to inspect its timeline, logs and payload here."
            compact
          />
        </div>
      </aside>
    );
  }

  function closePanel() {
    const params = new URLSearchParams(window.location.search);
    params.delete("run");
    const s = params.toString();
    router.push(`/event-manager/automations/runs${s ? `?${s}` : ""}`);
  }

  function runRetry(runId: string) {
    setPendingAction("retry");
    startTransition(async () => {
      const res = await retryRun(runId);
      setPendingAction(null);
      if (res.ok && res.newRunId) {
        setToast(`Retry queued as new run ${res.newRunId.slice(0, 8)}`);
        router.push(`/event-manager/automations/runs?run=${res.newRunId}`);
      } else {
        setToast(res.error ?? "Retry failed");
      }
    });
  }

  function runReplay(runId: string) {
    setPendingAction("replay");
    startTransition(async () => {
      const res = await replayRun(runId);
      setPendingAction(null);
      if (res.ok && res.newRunId) {
        setToast(`Replay queued as new run ${res.newRunId.slice(0, 8)}`);
        router.push(`/event-manager/automations/runs?run=${res.newRunId}`);
      } else {
        setToast(res.error ?? "Replay failed");
      }
    });
  }

  function runCancel(runId: string) {
    setPendingAction("cancel");
    startTransition(async () => {
      const res = await cancelRun(runId);
      setPendingAction(null);
      setMenuOpen(false);
      setToast(res.ok ? "Run cancelled" : res.error ?? "Cancel failed");
      router.refresh();
    });
  }

  function exportLogs() {
    if (!detail) return;
    const exportData = { ...detail, payload, mode };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${detail.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  const canCancel = ["queued", "running", "waiting_approval"].includes(detail.status);

  return (
    <aside className="w-full xl:w-[380px] shrink-0">
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden sticky top-4">
        <div className="p-4 border-b border-surface-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-surface-900 truncate">{detail.automationName}</h3>
              <p className="text-xs text-surface-400 font-mono mt-0.5">{detail.id}</p>
            </div>
            <button onClick={closePanel} className="text-surface-400 hover:text-surface-600 shrink-0" aria-label="Close run details">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <RunStatusBadge status={detail.status} />
            <span className="text-xs text-surface-400">{formatDate(detail.ts, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          {detail.errorText && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-xs text-danger-700">{detail.errorText}</p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => runRetry(detail.id)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {isPending && pendingAction === "retry" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Retry
            </button>
            <button
              onClick={() => runReplay(detail.id)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 disabled:opacity-60 transition-colors"
            >
              {isPending && pendingAction === "replay" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Repeat className="w-3.5 h-3.5" />}
              Replay
            </button>
            <div className="relative ml-auto">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1.5 rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-48 rounded-lg border border-surface-200 bg-white shadow-lg z-10 py-1">
                  {canCancel && (
                    <button
                      onClick={() => runCancel(detail.id)}
                      disabled={isPending}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger-600 hover:bg-danger-50 disabled:opacity-60"
                    >
                      {isPending && pendingAction === "cancel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      Cancel run
                    </button>
                  )}
                  <button onClick={exportLogs} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-700 hover:bg-surface-50">
                    <Download className="w-3.5 h-3.5" />
                    Export logs as JSON
                  </button>
                </div>
              )}
            </div>
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

        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 px-4 py-3 border-b border-surface-200 text-xs">
          <div>
            <p className="text-surface-400">Environment</p>
            <p className="font-medium text-surface-800 capitalize">{detail.environment}</p>
          </div>
          <div>
            <p className="text-surface-400">Source</p>
            <p className="font-medium text-surface-800 capitalize">{detail.triggerSource}</p>
          </div>
          <div>
            <p className="text-surface-400">Initiated by</p>
            <p className="font-medium text-surface-800">{initiatorLabel ?? "System"}</p>
          </div>
          <div>
            <p className="text-surface-400">Duration</p>
            <p className="font-medium text-surface-800 tabular-nums">
              {detail.durationMs === null ? "—" : detail.durationMs < 1000 ? `${detail.durationMs}ms` : `${(detail.durationMs / 1000).toFixed(1)}s`}
            </p>
          </div>
          <div>
            <p className="text-surface-400">Matched</p>
            <p className="font-medium text-surface-800 tabular-nums">{detail.matchedCount}</p>
          </div>
          <div>
            <p className="text-surface-400">Fired</p>
            <p className="font-medium text-surface-800 tabular-nums">{detail.firedCount}</p>
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

        <div className="p-4 max-h-[520px] overflow-y-auto">
          {tab === "timeline" && (
            <div className="space-y-2">
              {detail.steps.length === 0 ? (
                <p className="text-xs text-surface-400">No step-level log recorded for this run.</p>
              ) : (
                detail.steps.map((step) => {
                  const isExpanded = expandedStep === step.id;
                  return (
                    <div key={step.id} className="rounded-lg border border-surface-200 overflow-hidden">
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-50"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-semibold text-surface-400 shrink-0">#{step.stepIndex + 1}</span>
                          <span className="text-xs font-medium text-surface-800 truncate">
                            {actionLabels[step.actionKind] ?? step.actionKind}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-surface-400 tabular-nums">
                            {step.durationMs === null ? "—" : `${step.durationMs}ms`}
                          </span>
                          <StepStatusBadge success={step.success} />
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-surface-100 space-y-2">
                          <div className="text-[11px] text-surface-500 flex justify-between">
                            <span>Node: {step.nodeType ?? step.nodeId ?? "—"}</span>
                            <span>{formatDate(step.startedAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                          </div>
                          {step.errorText && (
                            <div className="rounded-md bg-danger-50 border border-danger-200 p-2">
                              <p className="text-[11px] text-danger-700 font-mono whitespace-pre-wrap break-words">{step.errorText}</p>
                            </div>
                          )}
                          {!step.success && (
                            <button
                              onClick={() => runRetry(detail.id)}
                              disabled={isPending}
                              className="text-[11px] font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60"
                            >
                              Retry from this step
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "logs" && (
            <div className="rounded-lg bg-surface-900 text-surface-100 p-3 font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
              {detail.errorText && <p className="text-danger-400">[run] {detail.errorText}</p>}
              {detail.steps.map((s) => (
                <p key={s.id} className={s.success ? "text-surface-300" : "text-danger-400"}>
                  [{formatDate(s.startedAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}] step #{s.stepIndex + 1} ·{" "}
                  {actionLabels[s.actionKind] ?? s.actionKind} · {s.success ? "ok" : "failed"}
                  {s.errorText ? ` — ${s.errorText}` : ""}
                </p>
              ))}
              {!detail.errorText && detail.steps.length === 0 && <p className="text-surface-500">No log output recorded for this run.</p>}
            </div>
          )}

          {(tab === "payload" || tab === "request-response") && (
            <div>
              {tab === "request-response" && (
                <p className="text-[11px] text-surface-400 mb-2">
                  This engine doesn&rsquo;t record a separate response payload — showing the same trigger payload used for this run.
                </p>
              )}
              {payload && Object.keys(payload as object).length > 0 ? (
                <pre className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-surface-400">No payload recorded for this run.</p>
              )}
            </div>
          )}

          {tab === "metadata" && (
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-surface-400">Run ID</dt>
                <dd className="font-mono text-surface-800">{detail.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-surface-400">Automation ID</dt>
                <dd className="font-mono text-surface-800">
                  <Link href={`/event-manager/automations/builder/${detail.automationId}`} className="hover:text-brand-600">
                    {detail.automationId.slice(0, 8)}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-surface-400">Mode</dt>
                <dd className="text-surface-800 capitalize">{mode?.replace(/_/g, " ") ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-surface-400">Matched count</dt>
                <dd className="text-surface-800 tabular-nums">{detail.matchedCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-surface-400">Fired count</dt>
                <dd className="text-surface-800 tabular-nums">{detail.firedCount}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </aside>
  );
}
