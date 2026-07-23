"use client";

import { useState, useTransition } from "react";
import { checkoutBoard } from "../actions";

function isControlFlowError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

export function CheckoutForm({
  eventId,
  disabled,
  guestEmail,
}: {
  eventId: string;
  disabled: boolean;
  guestEmail: string | null;
}) {
  const [email, setEmail] = useState(guestEmail ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await checkoutBoard(eventId, email);
      } catch (err) {
        if (isControlFlowError(err)) throw err;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      {error && <p className="text-xs text-danger-600">{error}</p>}
      <input
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="px-3 py-2.5 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
      />
      <button
        type="submit"
        disabled={disabled || pending}
        className="px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-brand"
      >
        {pending ? "Redirecting…" : "Checkout"}
      </button>
    </form>
  );
}
