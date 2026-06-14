"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Upload,
  Globe,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { slugify } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Your Role" },
  { id: 4, label: "Plan" },
  { id: 5, label: "Demo Data" },
  { id: 6, label: "First Event" },
  { id: 7, label: "Invite Team" },
  { id: 8, label: "Complete" },
];

const BUSINESS_TYPES = [
  { value: "agency", label: "Agency" },
  { value: "venue", label: "Venue" },
  { value: "freelance", label: "Freelance Planner" },
  { value: "in-house", label: "In-house Team" },
  { value: "other", label: "Other" },
];

export default function OnboardingWorkspacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [form, setForm] = useState({
    workspaceName: "",
    slug: "",
    businessType: "agency",
  });

  useEffect(() => {
    if (!slugEdited) {
      setForm((prev) => ({ ...prev, slug: slugify(prev.workspaceName) }));
    }
  }, [form.workspaceName, slugEdited]);

  // Debounced live slug-availability check against the live DB.
  useEffect(() => {
    const slug = form.slug;
    if (!slug) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const supabase = createClient();
    const handle = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "is_workspace_slug_available",
        { _slug: slug }
      );
      if (rpcError) {
        setSlugStatus("idle");
        return;
      }
      setSlugStatus(data ? "available" : "taken");
    }, 400);
    return () => clearTimeout(handle);
  }, [form.slug]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    if (name === "slug") {
      setSlugEdited(true);
      setForm((prev) => ({ ...prev, slug: slugify(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
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

    // Final availability guard before creating.
    const { data: available, error: availError } = await supabase.rpc(
      "is_workspace_slug_available",
      { _slug: form.slug }
    );
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

    const timezone =
      (typeof window !== "undefined" &&
        window.sessionStorage.getItem("onboarding_timezone")) ||
      "Europe/London";

    const { error: createError } = await supabase.rpc(
      "create_workspace_for_current_user",
      {
        _name: form.workspaceName,
        _slug: form.slug,
        _timezone: timezone,
        _currency: "GBP",
        _branding: { business_type: form.businessType },
      }
    );

    if (createError) {
      setError(createError.message);
      setLoading(false);
      return;
    }

    router.push("/onboarding/role");
    router.refresh();
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={2} />
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Create your workspace
          </h1>
          <p className="mt-1.5 text-sm text-surface-500">
            Your workspace is where your team manages events and collaborates.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            {error}
          </div>
        )}

        <form onSubmit={handleNext} className="space-y-6">
          {/* Logo upload */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-surface-100 border-2 border-surface-200 overflow-hidden flex items-center justify-center shrink-0">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 className="w-8 h-8 text-surface-400" strokeWidth={1.5} />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-surface-700 mb-1">
                Workspace logo
              </p>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all">
                <Upload className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
                Upload logo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </label>
              <p className="mt-1 text-xs text-surface-400">
                Square image recommended. Max 5MB.
              </p>
            </div>
          </div>

          {/* Workspace name */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Workspace name <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <Building2
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="text"
                name="workspaceName"
                value={form.workspaceName}
                onChange={handleChange}
                placeholder="Luxe Events Co."
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          {/* Slug */}
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
                placeholder="luxe-events-co"
                required
                className="flex-1 py-2.5 pr-4 text-sm bg-transparent focus:outline-none text-surface-900 placeholder:text-surface-400"
              />
            </div>
            {slugStatus === "checking" && (
              <p className="mt-1.5 text-xs text-surface-400 inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                Checking availability…
              </p>
            )}
            {slugStatus === "available" && (
              <p className="mt-1.5 text-xs text-success-600 inline-flex items-center gap-1.5">
                <Check className="w-3 h-3" strokeWidth={2.5} />
                This URL is available.
              </p>
            )}
            {slugStatus === "taken" && (
              <p className="mt-1.5 text-xs text-danger-600">
                This URL is already taken. Please choose another.
              </p>
            )}
            {slugStatus === "idle" && (
              <p className="mt-1.5 text-xs text-surface-400">
                Only lowercase letters, numbers and hyphens.
              </p>
            )}
          </div>

          {/* Business type */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Business type <span className="text-danger-500">*</span>
            </label>
            <select
              name="businessType"
              value={form.businessType}
              onChange={handleChange}
              className="w-full px-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all appearance-none text-surface-700"
            >
              {BUSINESS_TYPES.map((bt) => (
                <option key={bt.value} value={bt.value}>
                  {bt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => router.push("/onboarding/account")}
              className="inline-flex items-center gap-1.5 py-2.5 px-5 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
              Back
            </button>
            <button
              type="submit"
              disabled={loading || slugStatus === "taken" || slugStatus === "checking" || !form.slug}
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
