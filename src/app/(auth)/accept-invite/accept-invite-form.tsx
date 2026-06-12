"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Lock, Eye, EyeOff, User } from "lucide-react";

export default function AcceptInviteForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ fullName: "", password: "", confirmPassword: "" });

  const workspaceName = "Luxe Events Co.";
  const inviterName = "Sarah Mitchell";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    router.push("/home");
  }

  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center mb-4 shadow-brand">
              <Users className="w-8 h-8 text-white" strokeWidth={1.6} />
            </div>
            <h1 className="text-2xl font-bold text-surface-900 tracking-tight">You&apos;ve been invited</h1>
            <p className="mt-2 text-sm text-surface-500 leading-relaxed">
              <span className="font-semibold text-surface-700">{inviterName}</span> has invited you to join the{" "}
              <span className="font-semibold text-brand-700">{workspaceName}</span> workspace on Gala Dock.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Your full name</label>
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
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Create a password</label>
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

            <button
              type="submit"
              disabled={loading || passwordMismatch}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand mt-2"
            >
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Accept invitation & join"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-surface-400">
            By accepting you agree to Gala Dock&apos;s{" "}
            <a href="/terms" className="underline hover:text-surface-600" target="_blank">Terms of Service</a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-surface-600" target="_blank">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
