"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Wand2,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  ArrowDown,
  Info,
  CheckCircle2,
  AlertTriangle,
  Braces,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SMART_RULE_TRIGGERS, SMART_RULE_ACTIONS, ACTION_LABEL } from "@/lib/automations/smart-rules";
import { generateAutomationDraft, saveGeneratedAutomation, type GeneratedWorkflow } from "./actions";

// ─── Static, honest reference data ─────────────────────────────────────────

const MODULE_CHIPS = ["Events", "Suppliers", "Finance", "Tasks", "Tickets", "Comms"] as const;
type ModuleChip = (typeof MODULE_CHIPS)[number];

const PROMPT_SUGGESTIONS: { module: ModuleChip; prompt: string }[] = [
  { module: "Events", prompt: "When an event's stage changes to cancelled, notify the operations team internally." },
  { module: "Suppliers", prompt: "If a supplier hasn't replied to a job request, create a follow-up task for the account manager." },
  { module: "Finance", prompt: "When an invoice goes overdue, draft a polite payment-chase email to the client." },
  { module: "Tasks", prompt: "Remind the task owner by email when a task is due soon." },
  { module: "Tickets", prompt: "Every morning, send the team a digest notification of anything overdue." },
  { module: "Comms", prompt: "When a new file is uploaded as compliance evidence, notify the compliance lead." },
  { module: "Finance", prompt: "If a quote sits unread for a while, flag it internally so sales can chase." },
  { module: "Events", prompt: "Tag the record whenever an event moves to a new delivery stage." },
];

/** Which Gala Dock modules a trigger or action touches — a short, honest static map
 * (not a fabricated permissions engine), used only to explain the generated workflow. */
const TRIGGER_MODULES: Record<string, string> = {
  invoice_overdue: "Finance",
  quote_unread_after: "Finance / Pipeline",
  task_due_in: "Tasks",
  event_stage_changed: "Events",
  supplier_no_reply: "Suppliers",
  file_uploaded: "Documents",
  nightly_cron: "Scheduling",
};
const ACTION_MODULES: Record<string, string> = {
  send_email: "Communications",
  create_task: "Tasks",
  notify_user: "Notifications",
  set_tag: "Records",
  webhook_internal_only: "Integrations",
};
const ACTION_PERMISSIONS: Record<string, string> = {
  send_email: "Read: contact/record details. Send: workspace email (SMTP), review-first draft.",
  create_task: "Read: relevant record. Create: task assigned to a team member.",
  notify_user: "Read: relevant record. Create: in-app notification.",
  set_tag: "Read & update: record tags only.",
  webhook_internal_only: "Read: relevant record. Call: an internal-only webhook endpoint (no external network access).",
};

type LiveTrigger = (typeof SMART_RULE_TRIGGERS)[number]["value"];
type LiveAction = (typeof SMART_RULE_ACTIONS)[number]["value"];

interface WorkflowStep {
  id: string;
  action: LiveAction;
}

export function AiBuilderClient({ aiModelAvailable, workspaceName }: { aiModelAvailable: boolean; workspaceName: string | null }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [selectedModules, setSelectedModules] = useState<ModuleChip[]>([]);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [workflow, setWorkflow] = useState<GeneratedWorkflow | null>(null);
  const [trigger, setTrigger] = useState<LiveTrigger>("nightly_cron");
  const [conditionSummary, setConditionSummary] = useState<string>("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [automationName, setAutomationName] = useState("");

  const filteredSuggestions = useMemo(
    () => (selectedModules.length === 0 ? PROMPT_SUGGESTIONS : PROMPT_SUGGESTIONS.filter((s) => selectedModules.includes(s.module))),
    [selectedModules]
  );

  function toggleModule(m: ModuleChip) {
    setSelectedModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;
    setGenerateError(null);
    setSaved(false);
    setSaveError(null);
    startTransition(async () => {
      const res = await generateAutomationDraft(trimmed);
      if (!res.ok || !res.workflow) {
        setGenerateError(res.error ?? "Couldn't generate a workflow from that description. Try rephrasing it.");
        return;
      }
      setWorkflow(res.workflow);
      setTrigger(res.workflow.trigger);
      setConditionSummary(res.workflow.conditionSummary ?? "");
      setSteps([{ id: crypto.randomUUID(), action: res.workflow.action }]);
      setAutomationName(deriveName(trimmed));
      setRecentPrompts((prev) => [trimmed, ...prev.filter((p) => p !== trimmed)].slice(0, 5));
    });
  }

  function addStep() {
    setSteps((prev) => [...prev, { id: crypto.randomUUID(), action: SMART_RULE_ACTIONS[0].value }]);
  }
  function removeStep(id: string) {
    setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }
  function updateStepAction(id: string, action: LiveAction) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, action } : s)));
  }

  const jsonPreview = useMemo(() => {
    if (!workflow) return null;
    return {
      trigger,
      conditions: conditionSummary.trim() ? [conditionSummary.trim()] : [],
      actions: steps.map((s) => s.action),
    };
  }, [workflow, trigger, conditionSummary, steps]);

  function handleSaveDraft() {
    if (!workflow || steps.length === 0 || isPending) return;
    setSaveError(null);
    setSaved(false);
    const primaryModule = selectedModules[0] ? MODULE_TO_SMART_RULE[selectedModules[0]] : "operations";
    startTransition(async () => {
      const res = await saveGeneratedAutomation(
        automationName || "AI-built automation",
        trigger,
        steps[0].action,
        primaryModule,
        conditionSummary.trim() || null,
        steps.slice(1).map((s) => s.action)
      );
      if (res.ok && res.automationId) {
        setSaved(true);
        router.push(`/event-manager/automations/builder/${res.automationId}`);
      } else {
        setSaveError(res.error ?? "Couldn't save this automation. Try again.");
      }
    });
  }

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* ── Main column ────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">
          <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
            <div className="flex items-start gap-3 mb-4">
              <span className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <Wand2 className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-surface-900">Describe the automation you want to build</h2>
                <p className="text-xs text-surface-500 mt-0.5">
                  {aiModelAvailable
                    ? "Your description is matched to Gala Dock's automation engine by an AI model."
                    : "No AI model is configured right now — descriptions are matched using a deterministic keyword matcher, not a generative model."}
                </p>
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. When an invoice goes overdue, draft a chase email and notify finance…"
              rows={4}
              maxLength={800}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-none"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-surface-400">{prompt.length}/800</span>
              {workspaceName && <span className="text-[11px] text-surface-400">Building for {workspaceName}</span>}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {MODULE_CHIPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                    selectedModules.includes(m)
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {generateError && (
              <div className="mt-3 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-xs text-danger-700 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {generateError}
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() || isPending}
              className={cn(
                "mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors",
                !prompt.trim() || isPending
                  ? "bg-surface-100 text-surface-400 cursor-not-allowed"
                  : "bg-brand-600 text-white hover:bg-brand-700"
              )}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isPending ? "Generating…" : "Generate Workflow"}
            </button>
          </div>

          {/* Prompt Suggestions */}
          <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
            <h3 className="text-sm font-semibold text-surface-900 mb-3">Prompt Suggestions</h3>
            {filteredSuggestions.length === 0 ? (
              <p className="text-xs text-surface-400">No suggestions for the selected modules yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPrompt(s.prompt)}
                    className="text-left px-3 py-2.5 rounded-lg border border-surface-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
                  >
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 mb-1">
                      {s.module}
                    </span>
                    <p className="text-xs text-surface-700 leading-snug">{s.prompt}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent Prompts (session-only) */}
          {recentPrompts.length > 0 && (
            <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-surface-900">Recent Prompts</h3>
                <span className="inline-flex items-center gap-1 text-[11px] text-surface-400">
                  <Clock className="w-3 h-3" /> This session only — resets on reload
                </span>
              </div>
              <ul className="space-y-1.5">
                {recentPrompts.map((p, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setPrompt(p)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-surface-50 hover:bg-surface-100 text-xs text-surface-600 truncate"
                    >
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Generated Workflow Preview */}
          {workflow && (
            <div className="rounded-xl border border-surface-200 bg-white shadow-card p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-surface-900">Generated Workflow Preview</h3>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                    workflow.source === "ai"
                      ? "bg-brand-50 text-brand-700 border-brand-200"
                      : "bg-surface-100 text-surface-600 border-surface-200"
                  )}
                >
                  {workflow.source === "ai" ? <Sparkles className="w-3 h-3" /> : <Braces className="w-3 h-3" />}
                  {workflow.source === "ai" ? "AI-generated" : "Keyword-matched (no AI model used)"}
                </span>
              </div>
              <p className="text-xs text-surface-500 mb-4">{workflow.rationale} · Readiness {workflow.readiness}%</p>

              <label className="block text-xs font-medium text-surface-600 mb-1">Automation name</label>
              <input
                type="text"
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                className="w-full mb-4 px-3 py-2 text-sm rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
              />

              <div className="space-y-3">
                {/* Trigger step */}
                <div className="rounded-lg border border-surface-200 p-3">
                  <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide">Trigger</span>
                  <select
                    value={trigger}
                    onChange={(e) => setTrigger(e.target.value as LiveTrigger)}
                    className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-lg border border-surface-200 bg-white"
                  >
                    {SMART_RULE_TRIGGERS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-surface-400 mt-1">Touches: {TRIGGER_MODULES[trigger] ?? "—"}</p>
                </div>

                <div className="flex justify-center">
                  <ArrowDown className="w-4 h-4 text-surface-300" />
                </div>

                {/* Condition step */}
                <div className="rounded-lg border border-surface-200 p-3">
                  <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide">Condition (optional)</span>
                  <input
                    type="text"
                    value={conditionSummary}
                    onChange={(e) => setConditionSummary(e.target.value)}
                    placeholder="e.g. only for events tagged VIP"
                    className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-lg border border-surface-200 bg-white"
                  />
                </div>

                <div className="flex justify-center">
                  <ArrowDown className="w-4 h-4 text-surface-300" />
                </div>

                {/* Action steps */}
                {steps.map((s, i) => (
                  <div key={s.id} className="rounded-lg border border-surface-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide">
                        Action {steps.length > 1 ? i + 1 : ""} {i > 0 && "(outline only — see note below)"}
                      </span>
                      {steps.length > 1 && (
                        <button type="button" onClick={() => removeStep(s.id)} className="p-1 rounded-md hover:bg-surface-50 text-surface-400" aria-label="Remove step">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <select
                      value={s.action}
                      onChange={(e) => updateStepAction(s.id, e.target.value as LiveAction)}
                      className="w-full mt-1 px-2.5 py-1.5 text-sm rounded-lg border border-surface-200 bg-white"
                    >
                      {SMART_RULE_ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-surface-400 mt-1">Touches: {ACTION_MODULES[s.action] ?? "—"}</p>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addStep}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-surface-300 text-surface-500 hover:border-brand-300 hover:text-brand-600"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Step
                </button>
              </div>

              {steps.length > 1 && (
                <div className="mt-3 rounded-lg bg-info-50 border border-info-200 px-3 py-2 text-xs text-info-700 flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Only the first action runs automatically today. Additional actions are saved as an outline on the draft for you to wire up in the Canvas
                    Builder.
                  </span>
                </div>
              )}

              {saveError && (
                <div className="mt-3 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-xs text-danger-700 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {saveError}
                </div>
              )}
              {saved && (
                <div className="mt-3 rounded-lg bg-success-50 border border-success-200 px-3 py-2 text-xs text-success-700 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Saved as a disabled draft — opening it in the Canvas Builder…
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isPending}
                className={cn(
                  "mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors",
                  isPending ? "bg-surface-100 text-surface-400 cursor-not-allowed" : "bg-brand-600 text-white hover:bg-brand-700"
                )}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save as Draft
              </button>
            </div>
          )}
        </div>

        {/* ── Right rail ─────────────────────────────────────────────── */}
        <aside className="w-full xl:w-[320px] shrink-0 space-y-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-2">Source Context</h3>
            {selectedModules.length === 0 ? (
              <p className="text-xs text-surface-400">No module chips selected — suggestions show every module.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedModules.map((m) => (
                  <span key={m} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-200">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-2">Connected Modules</h3>
            {!workflow ? (
              <p className="text-xs text-surface-400">Generate a workflow to see which Gala Dock modules it touches.</p>
            ) : (
              <ul className="space-y-1.5 text-xs text-surface-600">
                <li>
                  <span className="font-medium text-surface-800">Trigger:</span> {TRIGGER_MODULES[trigger] ?? "—"}
                </li>
                {steps.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium text-surface-800">Action:</span> {ACTION_MODULES[s.action] ?? "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-2">Required Permissions</h3>
            {!workflow ? (
              <p className="text-xs text-surface-400">Generate a workflow to see the permissions each action needs.</p>
            ) : (
              <ul className="space-y-2 text-xs text-surface-600">
                {steps.map((s) => (
                  <li key={s.id} className="rounded-lg bg-surface-50 px-2.5 py-2">
                    <span className="font-medium text-surface-800">{ACTION_LABEL[s.action] ?? s.action}:</span> {ACTION_PERMISSIONS[s.action] ?? "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
            <h3 className="text-sm font-semibold text-surface-900 mb-2">Generated JSON Preview</h3>
            {!jsonPreview ? (
              <p className="text-xs text-surface-400">Generate a workflow to see the exact JSON that would be saved.</p>
            ) : (
              <pre className="text-[11px] leading-relaxed bg-surface-900 text-surface-100 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(jsonPreview, null, 2)}
              </pre>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

const MODULE_TO_SMART_RULE: Record<ModuleChip, string> = {
  Events: "events",
  Suppliers: "suppliers",
  Finance: "finance",
  Tasks: "tasks",
  Tickets: "tickets",
  Comms: "notifications",
};

function deriveName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  const cut = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}
