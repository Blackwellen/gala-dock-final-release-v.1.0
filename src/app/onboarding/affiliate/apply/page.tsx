"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Globe, Users, ChevronRight, AlertCircle } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { cn } from "@/lib/utils";
import { getOrStartOnboardingSession, saveOnboardingStep } from "@/lib/onboarding/actions";

const STEPS = [
  { id: 1, label: "Application" },
  { id: 2, label: "Complete" },
];

const CHANNELS = [
  "Website", "LinkedIn", "Instagram", "TikTok", "YouTube",
  "Newsletter", "Community", "Direct sales", "Consultancy", "Agency", "Events",
];

export default function AffiliateApplyPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    website: "",
    audienceSize: "",
    promotionPlan: "",
    termsAccepted: false,
  });

  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession("affiliate", "apply");
      if (!result.ok) return;
      setSessionId(result.data.id);
      const saved = result.data.draft?.apply as
        | (Partial<typeof form> & { channels?: string[] })
        | undefined;
      if (saved) {
        if (saved.channels) setChannels(saved.channels);
        setForm((prev) => ({ ...prev, ...saved }));
      }
    })();
  }, []);

  function toggleChannel(channel: string) {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.termsAccepted) {
      setError("You must accept the affiliate terms to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    if (sessionId) {
      const result = await saveOnboardingStep(sessionId, "apply", { ...form, channels }, "complete");
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
    }
    router.push("/onboarding/affiliate/complete");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={1} />
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Apply to the affiliate programme</h1>
          <p className="mt-1.5 text-sm text-surface-500">
            Earn commission referring event professionals to Gala Dock. Applications are reviewed
            before your referral links go live.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Website / social profile <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
              <input
                type="text"
                name="website"
                value={form.website}
                onChange={handleChange}
                placeholder="https://"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-surface-700 mb-2">How will you promote Gala Dock?</p>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChannel(c)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    channels.includes(c)
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-white border-surface-200 text-surface-600 hover:border-surface-300"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Audience size <span className="text-surface-400 font-normal">(rough estimate)</span>
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
              <input
                type="text"
                name="audienceSize"
                value={form.audienceSize}
                onChange={handleChange}
                placeholder="e.g. 5,000 monthly readers"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              How do you plan to promote Gala Dock? <span className="text-surface-400 font-normal">(optional)</span>
            </label>
            <textarea
              name="promotionPlan"
              value={form.promotionPlan}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all resize-none"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-surface-100">
            <input
              type="checkbox"
              checked={form.termsAccepted}
              onChange={(e) => setForm((prev) => ({ ...prev, termsAccepted: e.target.checked }))}
              className="mt-0.5 w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-surface-600">
              I agree to the{" "}
              <a href="/legal/affiliate-terms" target="_blank" className="underline hover:text-surface-800">
                Affiliate Terms
              </a>{" "}
              including disclosure obligations and the prohibition on spam and unauthorised paid ads.
            </span>
          </label>

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
                  Submit application
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
