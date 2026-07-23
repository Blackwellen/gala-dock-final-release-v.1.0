"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight, ChevronLeft } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { cn } from "@/lib/utils";
import { getOrStartOnboardingSession, saveOnboardingStep } from "@/lib/onboarding/actions";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Preferences" },
  { id: 3, label: "Complete" },
];

const EVENT_TYPES = [
  "Weddings", "Corporate events", "Private parties", "Conferences",
  "Concerts & gigs", "Galas & fundraisers", "Birthdays", "Other",
];

const NOTIFICATION_KEYS = [
  { key: "proposals", label: "Proposals", description: "New and updated proposals" },
  { key: "documents", label: "Documents", description: "Contracts and shared files" },
  { key: "invoices", label: "Invoices", description: "New invoices and payment reminders" },
  { key: "event_updates", label: "Event updates", description: "Changes to events you're attending" },
] as const;

export default function CustomerOnboardingPreferencesPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    proposals: true,
    documents: true,
    invoices: true,
    event_updates: true,
  });
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession("customer", "preferences");
      if (!result.ok) return;
      setSessionId(result.data.id);
      const saved = result.data.draft?.preferences as
        | {
            eventTypes?: string[];
            notifications?: Record<string, boolean>;
            marketingConsent?: boolean;
            smsConsent?: boolean;
          }
        | undefined;
      if (saved) {
        if (saved.eventTypes) setEventTypes(saved.eventTypes);
        if (saved.notifications) setNotifications(saved.notifications);
        if (typeof saved.marketingConsent === "boolean") setMarketingConsent(saved.marketingConsent);
        if (typeof saved.smsConsent === "boolean") setSmsConsent(saved.smsConsent);
      }
    })();
  }, []);

  function toggleEventType(type: string) {
    setEventTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleNext() {
    setLoading(true);
    if (sessionId) {
      await saveOnboardingStep(
        sessionId,
        "preferences",
        { eventTypes, notifications, marketingConsent, smsConsent },
        "complete"
      );
    }
    router.push("/onboarding/customer/complete");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={2} />
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Your preferences</h1>
          <p className="mt-1.5 text-sm text-surface-500">
            Help us tailor what you see and how we reach you. You can change these any time.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-surface-700 mb-2">Event types you&apos;re interested in</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleEventType(type)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    eventTypes.includes(type)
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-white border-surface-200 text-surface-600 hover:border-surface-300"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
              <p className="text-sm font-medium text-surface-700">Notify me about</p>
            </div>
            <div className="space-y-2">
              {NOTIFICATION_KEYS.map((n) => (
                <label
                  key={n.key}
                  className="flex items-start gap-3 p-3 rounded-lg border border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={notifications[n.key] ?? true}
                    onChange={(e) =>
                      setNotifications((prev) => ({ ...prev, [n.key]: e.target.checked }))
                    }
                    className="mt-0.5 w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-surface-800">{n.label}</p>
                    <p className="text-xs text-surface-500">{n.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Marketing/SMS consent kept deliberately separate from mandatory terms and from
              the operational notification toggles above. */}
          <div className="space-y-2 pt-2 border-t border-surface-100">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-surface-600">
                Send me occasional marketing emails about offers and new features
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-surface-600">
                Send me SMS reminders for upcoming events
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-2">
          <button
            type="button"
            onClick={() => router.push("/onboarding/customer/account")}
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
