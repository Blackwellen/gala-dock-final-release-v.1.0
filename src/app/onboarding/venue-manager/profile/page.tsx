"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { cn } from "@/lib/utils";
import { getOrStartOnboardingSession, saveOnboardingStep } from "@/lib/onboarding/actions";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Venue Profile" },
  { id: 4, label: "Complete" },
];

const PORTFOLIO_TYPES = [
  "Single venue", "Multi-venue group", "Hotel", "Nightclub group",
  "Theatre group", "Conference centre", "Festival site", "Wedding venue",
];

export default function VenueManagerOnboardingProfilePage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    portfolioType: "Single venue",
    numberOfVenues: "1",
    firstVenueName: "",
    firstVenueAddress: "",
    firstVenueCapacity: "",
  });

  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession("venue_manager", "profile");
      if (!result.ok) return;
      setSessionId(result.data.id);
      const saved = result.data.draft?.profile as Partial<typeof form> | undefined;
      if (saved) setForm((prev) => ({ ...prev, ...saved }));
    })();
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleNext() {
    setLoading(true);
    if (sessionId) {
      await saveOnboardingStep(sessionId, "profile", form, "complete");
    }
    router.push("/onboarding/venue-manager/complete");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={3} />
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Your venue portfolio</h1>
          <p className="mt-1.5 text-sm text-surface-500">
            Tell us about your venue(s) — you can add full details, spaces and rate cards later.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-surface-700 mb-2">Portfolio type</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PORTFOLIO_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, portfolioType: t }))}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all",
                    form.portfolioType === t
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-surface-200 text-surface-600 hover:border-surface-300"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-surface-50 rounded-xl border border-surface-200 space-y-4">
            <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide">First venue</p>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Venue name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="text"
                  name="firstVenueName"
                  value={form.firstVenueName}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                  <input
                    type="text"
                    name="firstVenueAddress"
                    value={form.firstVenueAddress}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Max capacity</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                  <input
                    type="number"
                    name="firstVenueCapacity"
                    value={form.firstVenueCapacity}
                    onChange={handleChange}
                    min={1}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-2">
          <button
            type="button"
            onClick={() => router.push("/onboarding/venue-manager/workspace")}
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
