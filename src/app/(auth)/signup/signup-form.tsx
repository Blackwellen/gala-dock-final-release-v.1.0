"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { User, Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed || passwordMismatch) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { display_name: form.fullName },
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/onboarding/account`
            : undefined,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // If Supabase requires email confirmation, no active session is returned.
    if (data.session) {
      router.push("/onboarding/account");
      router.refresh();
    } else {
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
    }
  }

  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  return (
    <div className="min-h-screen flex animate-fade-in">
      {/* Left — brand panel */}
      <div className="hidden lg:flex w-[520px] xl:w-[580px] shrink-0 bg-[#0e0c27] flex-col relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] rounded-full bg-brand-600/20 blur-3xl" />
          <div className="absolute bottom-[-10%] right-[-20%] w-[500px] h-[500px] rounded-full bg-violet-600/15 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col h-full p-10">
          <div className="mb-16">
            <Image
              src="/gala-dock-logo.png"
              alt="Gala Dock"
              width={140}
              height={36}
              className="brightness-0 invert"
              priority
            />
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight">
              Run every event<br />with confidence.
            </h2>
            <p className="mt-4 text-[#c8cae0] text-lg leading-relaxed">
              Join thousands of event professionals who manage their entire pipeline in Gala Dock.
            </p>

            <ul className="mt-10 space-y-3.5">
              {[
                "Centralise events, suppliers and clients in one place",
                "Automate run sheets and finance tracking",
                "Collaborate with your team in real time",
                "AI Copilot to draft briefs and chase suppliers",
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
            <p className="text-[#7275a0] text-xs">
              Trusted by event professionals across the UK 🇬🇧
            </p>
          </div>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="lg:hidden mb-8">
          <Image src="/gala-dock-logo.png" alt="Gala Dock" width={130} height={34} priority />
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-surface-500">
              Start your 14-day free trial — no card required
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Full name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="text"
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  autoComplete="name"
                  placeholder="Alex Johnson"
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  minLength={8}
                  required
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" strokeWidth={1.8} /> : <Eye className="w-4 h-4" strokeWidth={1.8} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                <input
                  type={showConfirm ? "text" : "password"}
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  required
                  className={`w-full pl-10 pr-10 py-2.5 text-sm border rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 transition-all placeholder:text-surface-400 ${
                    passwordMismatch
                      ? "border-danger-500 focus:ring-danger-500 focus:border-danger-500"
                      : "border-surface-200 focus:ring-brand-500 focus:border-brand-500"
                  }`}
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors" tabIndex={-1}>
                  {showConfirm ? <EyeOff className="w-4 h-4" strokeWidth={1.8} /> : <Eye className="w-4 h-4" strokeWidth={1.8} />}
                </button>
              </div>
              {passwordMismatch && <p className="mt-1.5 text-xs text-danger-600">Passwords do not match.</p>}
            </div>

            <label className="flex items-start gap-3 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-surface-300 accent-brand-600 cursor-pointer"
              />
              <span className="text-sm text-surface-600 leading-snug">
                I agree to the{" "}
                <Link href="/terms" className="text-brand-600 hover:text-brand-700 font-medium" target="_blank">Terms of Service</Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-brand-600 hover:text-brand-700 font-medium" target="_blank">Privacy Policy</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !agreed || passwordMismatch}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand mt-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Create account<ArrowRight className="w-4 h-4" strokeWidth={2} /></>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-surface-500">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-600 font-semibold hover:text-brand-700 transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
