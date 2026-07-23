"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe, ChevronRight, ChevronLeft, AlertCircle, Check, Loader2 } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { slugify } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  getOrStartOnboardingSession,
  saveOnboardingStep,
  setSessionWorkspaceDraft,
  type PortalType,
} from "@/lib/onboarding/actions";
import type { OnboardingWizardStep } from "./AccountStep";

/** Shared "create your workspace" step for Venue Manager and Supplier onboarding —
 * same real create_workspace_for_current_user + set_workspace_type RPCs the
 * Event Manager flow uses (src/app/onboarding/workspace/page.tsx), generalised. */
export function OnboardingWorkspaceStep({
  portalType,
  workspaceType,
  steps,
  backRoute,
  nextRoute,
  title,
  subtitle,
}: {
  portalType: PortalType;
  workspaceType: "venue" | "supplier";
  steps: OnboardingWizardStep[];
  backRoute: string;
  nextRoute: string;
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingResume, setCheckingResume] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [form, setForm] = useState({ workspaceName: "", slug: "" });

  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession(portalType, "workspace");
      if (!result.ok) {
        setCheckingResume(false);
        return;
      }
      setSessionId(result.data.id);
      if (result.data.workspace_draft_id) {
        router.replace(nextRoute);
        return;
      }
      const saved = result.data.draft?.workspace as Partial<typeof form> | undefined;
      if (saved) {
        setForm((prev) => ({ ...prev, ...saved }));
        if (saved.slug) setSlugEdited(true);
      }
      setCheckingResume(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const slug = form.slug;
    if (!slug) {
      queueMicrotask(() => setSlugStatus("idle"));
      return;
    }
    queueMicrotask(() => setSlugStatus("checking"));
    const supabase = createClient();
    const handle = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc("is_workspace_slug_available", { _slug: slug });
      if (rpcError) {
        setSlugStatus("idle");
        return;
      }
      setSlugStatus(data ? "available" : "taken");
    }, 400);
    return () => clearTimeout(handle);
  }, [form.slug]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name === "slug") {
      setSlugEdited(true);
      setForm((prev) => ({ ...prev, slug: slugify(value) }));
    } else if (name === "workspaceName") {
      // Auto-derive the slug from the name until the user edits it directly —
      // computed inline rather than via a syncing effect.
      setForm((prev) => ({
        ...prev,
        workspaceName: value,
        slug: slugEdited ? prev.slug : slugify(value),
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (slugStatus === "taken") {
      setError("That workspace URL is already taken. Please choose another.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data: available, error: availError } = await supabase.rpc("is_workspace_slug_available", {
      _slug: form.slug,
    });
    if (availError) {
      setError(availError.message);
      setLoading(false);
      return;
    }
    if (!available) {
      setSlugStatus("taken");
      setError("That workspace URL is already taken. Please choose another.");
      setLoading(false);
      return;
    }

    const { data: createdRows, error: createError } = await supabase.rpc("create_workspace_for_current_user", {
      _name: form.workspaceName,
      _slug: form.slug,
      _timezone: "Europe/London",
      _currency: "GBP",
      _branding: {},
    });
    if (createError) {
      setError(createError.message);
      setLoading(false);
      return;
    }

    const workspaceId = createdRows?.[0]?.id;
    if (workspaceId) {
      await supabase.rpc("set_workspace_type", { _workspace_id: workspaceId, _workspace_type: workspaceType });
    }

    if (sessionId && workspaceId) {
      await setSessionWorkspaceDraft(sessionId, workspaceId);
      await saveOnboardingStep(sessionId, "workspace", form, "profile");
    }

    router.push(nextRoute);
    router.refresh();
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={steps} current={2} />
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-surface-500">{subtitle}</p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            {error}
          </div>
        )}

        <form onSubmit={handleNext} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Workspace name <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
              <input
                type="text"
                name="workspaceName"
                value={form.workspaceName}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Workspace URL <span className="text-danger-500">*</span>
            </label>
            <div className="flex items-center border border-surface-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 bg-surface-50 focus-within:bg-white transition-all">
              <div className="flex items-center gap-1 pl-3 pr-2 text-sm text-surface-400 shrink-0">
                <Globe className="w-4 h-4" strokeWidth={1.8} />
                <span className="hidden sm:inline">galadock.com/</span>
              </div>
              <input
                type="text"
                name="slug"
                value={form.slug}
                onChange={handleChange}
                required
                className="flex-1 py-2.5 pr-4 text-sm bg-transparent focus:outline-none text-surface-900 placeholder:text-surface-400"
              />
            </div>
            {slugStatus === "checking" && (
              <p className="mt-1.5 text-xs text-surface-400 inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} /> Checking availability…
              </p>
            )}
            {slugStatus === "available" && (
              <p className="mt-1.5 text-xs text-success-600 inline-flex items-center gap-1.5">
                <Check className="w-3 h-3" strokeWidth={2.5} /> This URL is available.
              </p>
            )}
            {slugStatus === "taken" && (
              <p className="mt-1.5 text-xs text-danger-600">This URL is already taken. Please choose another.</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => router.push(backRoute)}
              className="inline-flex items-center gap-1.5 py-2.5 px-5 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
              Back
            </button>
            <button
              type="submit"
              disabled={loading || checkingResume || slugStatus === "taken" || slugStatus === "checking" || !form.slug}
              className="inline-flex items-center gap-2 py-2.5 px-6 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
