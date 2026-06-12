import Link from "next/link";
import { CheckCircle2, Clock, LayoutDashboard, MessageCircle, ArrowRight } from "lucide-react";
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

const NEXT_STEPS = [
  {
    icon: Clock,
    text: "Your 14-day free trial has started",
    sub: "No credit card required until you upgrade.",
  },
  {
    icon: LayoutDashboard,
    text: "Explore the platform",
    sub: "Navigate through events, suppliers, tasks and finance.",
  },
  {
    icon: MessageCircle,
    text: "Need help? Chat with Gala Copilot",
    sub: "Ask our AI assistant anything about running events.",
  },
];

export default function OnboardingCompletePage() {
  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={8} />
        </div>

        {/* Hero */}
        <div className="flex flex-col items-center text-center py-4">
          <CheckCircle2
            className="w-20 h-20 text-success-500 mb-5"
            strokeWidth={1.4}
          />
          <h1 className="text-3xl font-bold text-surface-900 tracking-tight">
            You&apos;re all set!
          </h1>
          <p className="mt-3 text-base text-surface-500 max-w-md leading-relaxed">
            Your Gala Dock workspace is ready. Everything is configured and waiting for you.
          </p>
        </div>

        {/* Summary card */}
        <div className="mt-7 grid grid-cols-3 divide-x divide-surface-200 rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
          <div className="px-4 py-4 text-center">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Workspace</p>
            <p className="mt-1 text-sm font-bold text-surface-900 truncate">Luxe Events Co.</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Plan</p>
            <p className="mt-1 text-sm font-bold text-brand-700">Growth Trial</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Team</p>
            <p className="mt-1 text-sm font-bold text-surface-900">1 member</p>
          </div>
        </div>

        {/* Next steps */}
        <div className="mt-7 space-y-3">
          {NEXT_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.text}
                className="flex items-start gap-3.5 p-4 rounded-xl border border-surface-200 bg-white"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-brand-600" strokeWidth={1.8} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-surface-800">{item.text}</p>
                  <p className="mt-0.5 text-xs text-surface-500 leading-snug">{item.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-8">
          <Link
            href="/home"
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors shadow-brand"
          >
            Go to dashboard
            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </div>
  );
}
