"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { cn } from "@/lib/utils";
import { getOrStartOnboardingSession, saveOnboardingStep } from "@/lib/onboarding/actions";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Business Profile" },
  { id: 4, label: "Complete" },
];

const SERVICE_CATEGORIES = [
  "AV & sound", "Lighting", "Staging & rigging", "DJ & entertainment",
  "Catering", "Bar service", "Security", "Staffing",
  "Decor & floristry", "Photography & video", "Transport", "Equipment hire",
];

export default function SupplierOnboardingProfilePage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [form, setForm] = useState({ coverageRegion: "", teamSize: "1" });

  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession("supplier", "profile");
      if (!result.ok) return;
      setSessionId(result.data.id);
      const saved = result.data.draft?.profile as
        | { categories?: string[]; coverageRegion?: string; teamSize?: string }
        | undefined;
      if (saved) {
        if (saved.categories) setCategories(saved.categories);
        setForm((prev) => ({
          coverageRegion: saved.coverageRegion ?? prev.coverageRegion,
          teamSize: saved.teamSize ?? prev.teamSize,
        }));
      }
    })();
  }, []);

  function toggleCategory(category: string) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleNext() {
    setLoading(true);
    if (sessionId) {
      await saveOnboardingStep(sessionId, "profile", { categories, ...form }, "complete");
    }
    router.push("/onboarding/supplier/complete");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={3} />
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Your services</h1>
          <p className="mt-1.5 text-sm text-surface-500">
            What do you supply, and where? You can add pricing and compliance documents later.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-surface-700 mb-2">Service categories</p>
            <div className="flex flex-wrap gap-2">
              {SERVICE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    categories.includes(c)
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-white border-surface-200 text-surface-600 hover:border-surface-300"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Coverage region</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="text"
                  name="coverageRegion"
                  value={form.coverageRegion}
                  onChange={handleChange}
                  placeholder="e.g. London & South East"
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Team size</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="number"
                  name="teamSize"
                  value={form.teamSize}
                  onChange={handleChange}
                  min={1}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-2">
          <button
            type="button"
            onClick={() => router.push("/onboarding/supplier/workspace")}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={loading}
            className="inline-flex items-center gap-2 py-2.5 px-6 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
