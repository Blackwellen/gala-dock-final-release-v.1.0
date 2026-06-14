"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, PenLine } from "lucide-react";
import { signProposal, declineProposal } from "./actions";

export function SignPanel({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; at: string } | null>(null);
  const [declined, setDeclined] = useState(false);

  function sign() {
    setError(null);
    startTransition(async () => {
      const res = await signProposal({ token, name, agreed });
      if (res.ok && res.signedName && res.signedAt) {
        setDone({ name: res.signedName, at: res.signedAt });
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  function decline() {
    if (!confirm("Decline this proposal? Your event planner will be notified.")) return;
    setError(null);
    startTransition(async () => {
      const res = await declineProposal(token);
      if (res.ok) setDeclined(true);
      else setError(res.error ?? "Something went wrong.");
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-success-200 bg-success-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" />
        <h2 className="mt-3 text-base font-semibold text-success-800">Thank you, {done.name}.</h2>
        <p className="mt-1 text-sm text-success-700">
          This proposal has been signed and your event planner has been notified.
        </p>
        <p className="mt-1 text-xs text-success-600">
          Signed on {new Date(done.at).toLocaleString("en-GB")}.
        </p>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="rounded-lg border border-surface-200 bg-surface-50 p-6 text-center">
        <h2 className="text-base font-semibold text-surface-800">Proposal declined</h2>
        <p className="mt-1 text-sm text-surface-600">
          Your response has been recorded. Please contact your event planner with any questions.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50 p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-surface-900">
        <PenLine className="h-5 w-5 text-brand-600" /> Sign this proposal
      </h2>

      {error && (
        <p className="mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}

      <label className="mt-4 flex items-start gap-3 text-sm text-surface-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-surface-300 accent-brand-600"
        />
        <span>I have read and agree to the terms and conditions set out in this proposal.</span>
      </label>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-surface-700">Full name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type your full name"
          className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={sign}
          disabled={pending || !agreed || !name.trim()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-brand-700"
        >
          {pending ? "Recording…" : "Sign & Accept Proposal"}
        </button>
        <button
          onClick={decline}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-medium text-surface-600 disabled:opacity-50 hover:bg-white"
        >
          Decline
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-surface-400">
        By signing, you agree to the terms above. This constitutes a legally binding agreement
        under UK contract law. The date, time and your IP address will be recorded.
      </p>
    </div>
  );
}
