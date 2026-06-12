"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Tag, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";

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

const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "corporate", label: "Corporate" },
  { value: "private", label: "Private" },
  { value: "conference", label: "Conference" },
];

export default function OnboardingFirstEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    eventName: "",
    eventType: "corporate",
    date: "",
    guestCount: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    router.push("/onboarding/invite-team");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={6} />
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Create your first event
          </h1>
          <p className="mt-1.5 text-sm text-surface-500">
            Add a real or placeholder event to get started. You can always edit it later.
          </p>
        </div>

        <form onSubmit={handleNext} className="space-y-5">
          {/* Event name */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Event name <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <CalendarDays
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="text"
                name="eventName"
                value={form.eventName}
                onChange={handleChange}
                placeholder="e.g. Smith & Jones Wedding"
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          {/* Event type */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Event type <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <Tag
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <select
                name="eventType"
                value={form.eventType}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all appearance-none text-surface-700"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Event date <span className="text-danger-500">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-surface-700"
            />
          </div>

          {/* Guest count */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Expected guest count <span className="text-danger-500">*</span>
            </label>
            <div className="relative">
              <Users
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="number"
                name="guestCount"
                value={form.guestCount}
                onChange={handleChange}
                placeholder="e.g. 120"
                min={1}
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => router.push("/onboarding/demo-data")}
              className="inline-flex items-center gap-1.5 py-2.5 px-5 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
              Back
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/onboarding/invite-team")}
                className="text-sm text-surface-500 hover:text-surface-700 font-medium transition-colors"
              >
                I&apos;ll do this later
              </button>
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
          </div>
        </form>
      </div>
    </div>
  );
}
