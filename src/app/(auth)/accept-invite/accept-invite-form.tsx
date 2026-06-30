"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Lock, Eye, EyeOff, User, Mail, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const emailParam = searchParams.get("email") ?? "";
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: emailParam,
    password: "",
    confirmPassword: "",
  });

  const workspaceName = "your new workspace";
  const inviterName = "A teammate";

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) return;
    if (!token) {
      setError("This invitation link is invalid or has expired.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Accept the invite as the currently signed-in user; if there's no session,
    // create the account (or sign in) first using the invited email.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      if (!form.email) {
        setError("Enter the email address this invitation was sent to.");
        setLoading(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { display_name: form.fullName } },
      });

      // If the account already exists, fall back to signing in.
      if (signUpError) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (signInError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }
      } else if (!signUpData.session) {
        // Email confirmation is required before the invite can be accepted.
        setError(
          "Please confirm your email address using the link we just sent, then open this invitation again."
        );
        setLoading(false);
        return;
      }
    }

    const { error: acceptError } = await supabase.rpc(
      "accept_workspace_invitation_by_token",
      { _token_hash: token }
    );

    if (acceptError) {
      setError(acceptError.message);
      setLoading(false);
      return;
    }

    router.push("/event-manager/home");
    router.refresh();
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

          {error && (
            <div className="mb-4 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {!emailParam && (
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
            )}

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
