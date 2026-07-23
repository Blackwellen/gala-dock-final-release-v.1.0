"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, ArrowRight, Loader2, AlertCircle, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-redirect";

// A deliberately calmer, event-experience-focused login — customers are ticket
// buyers, event guests and clients reviewing proposals/invoices, never operator
// workspace terminology. Same Supabase Auth backend as operator/affiliate login,
// but this always lands in the customer portal, never a workspace shell.
export function CustomerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlNext = safeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const target = urlNext
      ? `/auth/resolve?next=${encodeURIComponent(urlNext)}`
      : "/auth/resolve?portal=customer";
    router.push(target);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-brand-50/60 via-white to-white px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/gala-dock-logo.png" alt="Gala Dock" width={130} height={34} priority />
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold">
            <Ticket className="w-3.5 h-3.5" strokeWidth={2.5} />
            Customer
          </div>
        </div>

        <div className="bg-white border border-surface-200 rounded-2xl p-8 shadow-card">
          <h1 className="text-lg font-semibold text-surface-900 mb-1">Welcome back</h1>
          <p className="text-sm text-surface-500 mb-6 leading-relaxed">
            Sign in to view your tickets, proposals, invoices and event details.
          </p>

          {error && (
            <div className="mb-5 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-surface-50 border border-surface-200 rounded-lg text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-surface-600">Password</label>
                <Link href="/forgot-password" className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-surface-50 border border-surface-200 rounded-lg text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-surface-500">
            New here?{" "}
            <Link href={`/signup${urlNext ? `?next=${encodeURIComponent(urlNext)}` : ""}`} className="text-brand-600 font-semibold hover:text-brand-700 transition-colors">
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-surface-400">
          Run events on Gala Dock? <Link href="/operator/login" className="underline hover:text-surface-600">Operator sign in</Link>
        </p>
      </div>
    </div>
  );
}
