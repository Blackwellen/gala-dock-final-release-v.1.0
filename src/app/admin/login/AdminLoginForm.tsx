"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert, Lock, Mail, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const denied = searchParams.get("denied") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    denied ? "That account isn't authorized for platform admin access." : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !signInData.user) {
      setError(authError?.message ?? "Sign in failed.");
      setLoading(false);
      return;
    }

    // Isolated check, distinct from the regular workspace login — an ordinary workspace/customer
    // account authenticating successfully here is still immediately rejected and signed back out.
    const { data: isAdmin } = await supabase.rpc("is_platform_admin", { _uid: signInData.user.id });
    if (!isAdmin) {
      await supabase.auth.signOut();
      setError("That account isn't authorized for platform admin access.");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#150a0a] px-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-danger-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/gala-dock-logo.png" alt="Gala Dock" width={130} height={34} className="brightness-0 invert" priority />
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-danger-500/40 bg-danger-500/10 text-danger-200 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2.5} />
            Platform Admin
          </div>
        </div>

        <div className="bg-[#1e1010] border border-danger-700/40 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-lg font-semibold text-white mb-1">Restricted access</h1>
          <p className="text-sm text-white/50 mb-6">
            This is a separate, isolated sign-in for Gala Dock platform administrators only —
            workspace accounts cannot use it.
          </p>

          {error && (
            <div className="mb-5 flex items-center gap-2.5 px-4 py-3 bg-danger-700/20 border border-danger-600/50 rounded-lg text-sm text-danger-200">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">Admin email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#150a0a] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:border-danger-500 transition-all"
                  placeholder="admin@galadock.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" strokeWidth={1.8} />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#150a0a] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:border-danger-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-danger-600 hover:bg-danger-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                </>
              ) : (
                <>
                  Sign in to admin <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          Not a platform admin? Use the regular <a href="/login" className="underline hover:text-white/60">workspace sign in</a>.
        </p>
      </div>
    </div>
  );
}
