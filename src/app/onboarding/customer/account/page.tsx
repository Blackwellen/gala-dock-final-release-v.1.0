"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Phone, Building2, ChevronRight, AlertCircle } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { cn } from "@/lib/utils";
import { getOrStartOnboardingSession, saveOnboardingStep } from "@/lib/onboarding/actions";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Preferences" },
  { id: 3, label: "Complete" },
];

const CUSTOMER_TYPES = [
  { value: "individual", label: "Private individual" },
  { value: "business", label: "Business" },
  { value: "charity", label: "Charity" },
  { value: "school", label: "School" },
  { value: "club", label: "Club" },
  { value: "community", label: "Community organisation" },
  { value: "agency", label: "Agency client" },
  { value: "other", label: "Other" },
];

const COMPANY_TYPES = new Set(["business", "charity", "school", "club", "community", "agency"]);

export default function CustomerOnboardingAccountPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    preferredContactMethod: "email",
    timezone: "Europe/London",
    customerType: "individual",
    companyName: "",
    jobTitle: "",
  });

  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession("customer", "account");
      if (!result.ok) return;
      setSessionId(result.data.id);
      const saved = result.data.draft?.account as Partial<typeof form> | undefined;
      if (saved) setForm((prev) => ({ ...prev, ...saved }));
    })();
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (sessionId) {
      const result = await saveOnboardingStep(sessionId, "account", form, "preferences");
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
    }
    router.push("/onboarding/customer/preferences");
  }

  const isCompany = COMPANY_TYPES.has(form.customerType);

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={1} />
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Tell us about you</h1>
          <p className="mt-1.5 text-sm text-surface-500">
            A few details so we can personalise your event experience.
          </p>
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
              Full name <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Phone (optional)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
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
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Preferred contact</label>
              <select
                name="preferredContactMethod"
                value={form.preferredContactMethod}
                onChange={handleChange}
                className="w-full px-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-surface-700"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="sms">SMS</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">I&apos;m signing up as</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CUSTOMER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, customerType: t.value }))}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all",
                    form.customerType === t.value
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-surface-200 text-surface-600 hover:border-surface-300"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {isCompany && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-surface-50 rounded-xl border border-surface-200">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">
                  Organisation name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                  <input
                    type="text"
                    name="companyName"
                    value={form.companyName}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Your role</label>
                <input
                  type="text"
                  name="jobTitle"
                  value={form.jobTitle}
                  onChange={handleChange}
                  placeholder="e.g. Events Coordinator"
                  className="w-full px-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                />
              </div>
            </div>
          )}

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
