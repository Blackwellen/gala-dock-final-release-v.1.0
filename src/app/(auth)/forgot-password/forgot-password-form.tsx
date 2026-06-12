"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail, ArrowLeft, Send } from "lucide-react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          {!sent ? (
            <>
              <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-6">
                <Mail className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
              </div>
              <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Forgot your password?</h1>
              <p className="mt-2 text-sm text-surface-500 leading-relaxed">
                No problem. Enter your email address and we&apos;ll send you a link to reset it.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all placeholder:text-surface-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Send className="w-4 h-4" strokeWidth={2} />Send reset link</>
                  )}
                </button>
              </form>

              <div className="mt-6 flex items-center justify-center">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 font-medium transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
                  Back to sign in
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-success-600" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-bold text-surface-900">Check your inbox</h2>
              <p className="mt-3 text-sm text-surface-500 leading-relaxed">
                We&apos;ve sent a password reset link to{" "}
                <span className="font-semibold text-surface-700">{email}</span>.
                It may take a minute or two to arrive.
              </p>
              <p className="mt-3 text-xs text-surface-400">Don&apos;t see it? Check your spam or junk folder.</p>
              <button onClick={() => setSent(false)} className="mt-6 text-sm text-brand-600 hover:text-brand-700 font-semibold transition-colors">
                Try a different email
              </button>
              <div className="mt-4 flex items-center justify-center">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 font-medium transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
                  Back to sign in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
