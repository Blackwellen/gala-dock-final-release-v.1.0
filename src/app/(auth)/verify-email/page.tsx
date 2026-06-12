"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, RefreshCw } from "lucide-react";

export default function VerifyEmailPage() {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    setResending(true);
    await new Promise((r) => setTimeout(r, 800));
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8 text-center">
          {/* Email icon */}
          <div className="w-20 h-20 rounded-full bg-brand-50 border-2 border-brand-100 flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-brand-600" strokeWidth={1.4} />
          </div>

          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Verify your email address
          </h1>
          <p className="mt-3 text-sm text-surface-500 leading-relaxed max-w-sm mx-auto">
            We&apos;ve sent a verification link to your email address. Click the link in the email
            to activate your account.
          </p>

          {/* Resent confirmation */}
          {resent && (
            <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-success-50 border border-success-500/20 rounded-full text-sm font-medium text-success-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                <path d="M3 8l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Verification email sent!
            </div>
          )}

          <div className="mt-7 space-y-3">
            <button
              onClick={handleResend}
              disabled={resending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
            >
              {resending ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" strokeWidth={2} />
                  Resend verification email
                </>
              )}
            </button>
          </div>

          {/* Spam note */}
          <p className="mt-5 text-xs text-surface-400">
            Can&apos;t find the email? Check your{" "}
            <span className="font-medium text-surface-500">spam or junk folder</span>.
          </p>

          <div className="mt-6 pt-5 border-t border-surface-100">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
