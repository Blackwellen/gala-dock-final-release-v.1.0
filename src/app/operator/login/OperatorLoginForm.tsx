"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  Lock,
  ArrowRight,
  KeyRound,
  Loader2,
  AlertCircle,
  CalendarDays,
  Building2,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-redirect";

// Operator login is the shared entry point for the three operator workspace
// contexts (Event Manager / Venue Manager / Supplier). All three authenticate
// against the same Supabase Auth account and land through /auth/resolve, which
// detects the real persona from the signed-in user's workspace membership —
// the picker below only sets expectations/copy, it never grants access itself.
const OPERATOR_CONTEXTS = [
  { key: "event_manager", label: "Event Manager", icon: CalendarDays, blurb: "Plan and deliver events end-to-end" },
  { key: "venue_manager", label: "Venue Manager", icon: Building2, blurb: "Manage spaces, bookings and hire" },
  { key: "supplier", label: "Supplier", icon: Wrench, blurb: "Fulfil jobs and manage your business" },
] as const;

export function OperatorLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlNext = safeNext(searchParams.get("next"));
  const [context, setContext] = useState<(typeof OPERATOR_CONTEXTS)[number]["key"]>("event_manager");
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
      : "/auth/resolve?portal=operator";
    router.push(target);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex w-[520px] xl:w-[580px] shrink-0 bg-[#0e0c27] flex-col relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] rounded-full bg-brand-600/20 blur-3xl" />
          <div className="absolute bottom-[-10%] right-[-20%] w-[500px] h-[500px] rounded-full bg-violet-600/15 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col h-full p-10">
          <div className="mb-16">
            <Image src="/gala-dock-logo.png" alt="Gala Dock" width={140} height={36} className="brightness-0 invert" priority />
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight">
              The Event Delivery OS<br />for professional teams.
            </h2>
            <p className="mt-4 text-[#c8cae0] text-lg leading-relaxed">
              One sign-in for Event Managers, Venue Managers and Suppliers — each with their
              own workspace, permissions and tools.
            </p>

            <ul className="mt-10 space-y-3.5">
              {[
                "Complete event pipeline from enquiry to delivery",
                "Venue booking, hold and hire management",
                "Supplier quotes, jobs and document management",
                "Client & supplier portals with approval flows",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[#c8cae0] text-sm">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-brand-600/30 border border-brand-500/40 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-brand-400" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto pt-8 border-t border-[#1f1d45]">
            <p className="text-[#7275a0] text-xs">Trusted by event professionals across the UK</p>
          </div>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="lg:hidden mb-8">
          <Image src="/gala-dock-logo.png" alt="Gala Dock" width={130} height={34} priority />
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Operator sign in</h1>
            <p className="mt-1.5 text-sm text-surface-500">
              For Event Managers, Venue Managers and Suppliers running their business on Gala Dock.
            </p>
          </div>

          <div className="mb-6">
            <p className="text-xs font-medium text-surface-500 mb-2">I&apos;m signing in as</p>
            <div className="grid grid-cols-3 gap-2">
              {OPERATOR_CONTEXTS.map((c) => {
                const Icon = c.icon;
                const isSelected = context === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setContext(c.key)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-center transition-all ${
                      isSelected
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-surface-200 text-surface-600 hover:border-surface-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.8} />
                    <span className="text-[11px] font-semibold leading-tight">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-surface-700">Password</label>
                <Link href="/forgot-password" className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-brand mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </>
              )}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-surface-200" />
            <span className="text-xs text-surface-400 font-medium">or</span>
            <div className="flex-1 h-px bg-surface-200" />
          </div>

          <Link
            href="/otp"
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 border border-surface-200 text-sm font-medium text-surface-700 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
          >
            <KeyRound className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
            Sign in with one-time code
          </Link>

          <p className="mt-8 text-center text-sm text-surface-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-brand-600 font-semibold hover:text-brand-700 transition-colors">
              Create account
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-surface-400 flex items-center justify-center gap-3 flex-wrap">
            <span>Customer? <Link href="/customer/login" className="underline hover:text-surface-600">Sign in here</Link></span>
            <span aria-hidden>·</span>
            <span>Affiliate? <Link href="/affiliate/login" className="underline hover:text-surface-600">Sign in here</Link></span>
            <span aria-hidden>·</span>
            <span>Platform admin? <Link href="/admin/login" className="underline hover:text-surface-600">Sign in here</Link></span>
          </p>
        </div>
      </div>
    </div>
  );
}
