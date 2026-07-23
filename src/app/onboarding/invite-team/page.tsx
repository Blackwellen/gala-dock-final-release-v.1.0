"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Plus, X, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import {
  getOrStartOnboardingSession,
  saveOnboardingStep,
  createOnboardingTeamInvite,
} from "@/lib/onboarding/actions";

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

export default function OnboardingInviteTeamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const result = await getOrStartOnboardingSession("event_manager", "invite-team");
      if (!result.ok) return;
      setSessionId(result.data.id);
      setWorkspaceId(result.data.workspace_draft_id);
      const saved = result.data.draft?.["invite-team"] as { invites?: string[] } | undefined;
      if (saved?.invites) setInvites(saved.invites);
    })();
  }, []);

  function addInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (invites.includes(trimmed)) {
      setError("This email has already been added.");
      return;
    }
    setInvites((prev) => [...prev, trimmed]);
    setEmail("");
    setError("");
  }

  function removeInvite(addr: string) {
    setInvites((prev) => prev.filter((e) => e !== addr));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addInvite();
    }
  }

  async function handleNext() {
    setLoading(true);
    setError("");

    if (sessionId && workspaceId && invites.length > 0) {
      for (const inviteEmail of invites) {
        const result = await createOnboardingTeamInvite(sessionId, workspaceId, inviteEmail, "member");
        if (!result.ok) {
          setError(`Couldn't invite ${inviteEmail}: ${result.error}`);
          setLoading(false);
          return;
        }
      }
    }

    if (sessionId) {
      await saveOnboardingStep(sessionId, "invite-team", { invites }, "complete");
    }

    router.push("/onboarding/complete");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={7} />
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Invite your team
          </h1>
          <p className="mt-1.5 text-sm text-surface-500">
            Send invitations to your colleagues so they can join your workspace. You can also do
            this later from Settings.
          </p>
        </div>

        {/* Add invite input */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-surface-700">
            Team member email
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="colleague@example.com"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
              />
            </div>
            <button
              type="button"
              onClick={addInvite}
              className="inline-flex items-center gap-1.5 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-brand shrink-0"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Add
            </button>
          </div>
          {error && <p className="text-xs text-danger-600">{error}</p>}
        </div>

        {/* Invite chips */}
        {invites.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
              <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide">
                Pending invites ({invites.length})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {invites.map((addr) => (
                <div
                  key={addr}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-brand-50 border border-brand-200 rounded-full text-sm text-brand-700 font-medium"
                >
                  <span className="text-xs">{addr}</span>
                  <button
                    type="button"
                    onClick={() => removeInvite(addr)}
                    className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-brand-200 transition-colors"
                    aria-label={`Remove ${addr}`}
                  >
                    <X className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state hint */}
        {invites.length === 0 && (
          <div className="mt-5 p-4 bg-surface-50 rounded-xl border border-surface-200 text-center">
            <Users className="w-8 h-8 text-surface-300 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-surface-500">
              No invites added yet. Add emails above or skip for now.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-2">
          <button
            type="button"
            onClick={() => router.push("/onboarding/first-event")}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/onboarding/complete")}
              className="text-sm text-surface-500 hover:text-surface-700 font-medium transition-colors"
            >
              Skip for now
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
                  {invites.length > 0 ? "Send invites" : "Next"}
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
