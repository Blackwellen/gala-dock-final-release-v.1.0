"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Phone, Clock, Upload, ChevronRight, AlertCircle } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { createClient } from "@/lib/supabase/client";
import { getOrStartOnboardingSession, saveOnboardingStep } from "@/lib/onboarding/actions";

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

const TIMEZONES = [
  { value: "UTC", label: "UTC — Coordinated Universal Time" },
  { value: "Europe/London", label: "Europe/London — GMT/BST" },
  { value: "America/New_York", label: "America/New_York — ET" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles — PT" },
  { value: "Asia/Dubai", label: "Asia/Dubai — GST" },
];

export default function OnboardingAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    timezone: "Europe/London",
  });

  // Resume: find or start the active onboarding session and prefill from any
  // previously-autosaved draft so refreshing/returning later picks up where
  // the user left off.
  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession("event_manager", "account");
      if (!result.ok) return;
      setSessionId(result.data.id);
      const saved = result.data.draft?.account as
        | { fullName?: string; phone?: string; timezone?: string }
        | undefined;
      if (saved) {
        setForm((prev) => ({
          fullName: saved.fullName ?? prev.fullName,
          phone: saved.phone ?? prev.phone,
          timezone: saved.timezone ?? prev.timezone,
        }));
      }
    })();
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      router.push("/login");
      return;
    }

    // Persist profile details. The profile row is created on sign-up by a trigger;
    // update display name + timezone here (phone has no profile column).
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        display_name: form.fullName,
        timezone: form.timezone,
      })
      .eq("user_id", user.id);

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    // Carry the timezone forward so the workspace step can reuse it.
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("onboarding_timezone", form.timezone);
    }

    if (sessionId) {
      await saveOnboardingStep(sessionId, "account", form, "workspace");
    }

    router.push("/onboarding/workspace");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={1} />
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Set up your profile
          </h1>
          <p className="mt-1.5 text-sm text-surface-500">
            Tell us a bit about yourself so we can personalise your experience.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            {error}
          </div>
        )}

        <form onSubmit={handleNext} className="space-y-6">
          {/* Avatar upload */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full bg-brand-50 border-2 border-brand-100 overflow-hidden flex items-center justify-center">
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-brand-400" strokeWidth={1.5} />
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-surface-700 mb-1">
                Profile photo
              </p>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all">
                <Upload className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
              <p className="mt-1 text-xs text-surface-400">
                JPG, PNG or WebP. Max 5MB.
              </p>
            </div>
          </div>

          {/* Full name */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Full name <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <User
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                autoComplete="name"
                placeholder="Alex Johnson"
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Phone number{" "}
              <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Phone
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                autoComplete="tel"
                placeholder="+44 7700 900000"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Timezone <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <Clock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <select
                name="timezone"
                value={form.timezone}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all appearance-none text-surface-700"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
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
