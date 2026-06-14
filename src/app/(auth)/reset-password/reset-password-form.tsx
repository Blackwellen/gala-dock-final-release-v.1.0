"use client";

import Link from "next/link";
import { useState } from "react";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ password: "", confirmPassword: "" });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) return;
    setLoading(true);
    setError(null);

    // The recovery session is established from the email link before this page loads.
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    });

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          {!done ? (
            <>
              <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-6">
                <Lock className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
              </div>
              <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Reset your password</h1>
              <p className="mt-2 text-sm text-surface-500 leading-relaxed">
                Choose a strong new password for your Gala Dock account.
              </p>

              {error && (
                <div className="mt-5 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
                  <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">New password</label>
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
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">Confirm new password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" strokeWidth={1.8} />
                    <input
                      type={showConfirm ? "text" : "password"}
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      placeholder="Repeat your new password"
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

                <button
                  type="submit"
                  disabled={loading || passwordMismatch}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
                >
                  {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Reset password"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <CheckCircle2 className="w-16 h-16 text-success-500 mx-auto mb-5" strokeWidth={1.5} />
              <h2 className="text-xl font-bold text-surface-900">Password updated</h2>
              <p className="mt-3 text-sm text-surface-500 leading-relaxed">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <Link href="/login" className="mt-6 inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
                Go to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
