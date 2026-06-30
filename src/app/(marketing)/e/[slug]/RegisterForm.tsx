"use client";

import { useState, useTransition } from "react";
import { registerInterest } from "./actions";

export function RegisterForm({ eventId, workspaceId }: { eventId: string; workspaceId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return <p className="text-sm text-success-700">Thanks {name || "you"} — you're registered. We'll be in touch.</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(false);
        start(async () => {
          const res = await registerInterest({ eventId, workspaceId, name, email });
          if (res.ok) setDone(true);
          else setError(true);
        });
      }}
      className="space-y-3"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        required
        className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email (optional)"
        className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {error && <p className="text-xs text-danger-600">Couldn't register just now — please try again.</p>}
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="w-full px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
