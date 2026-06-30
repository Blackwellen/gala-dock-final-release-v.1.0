"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const CODE_LENGTH = 6;

export default function MfaForm() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  function handleDigitChange(index: number, value: string) {
    const cleaned = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    const next = Array(CODE_LENGTH).fill("");
    pasted.split("").forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (digits.join("").length < CODE_LENGTH) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Find the enrolled TOTP factor, open a challenge, then verify the code.
    const { data: factorsData, error: factorsError } =
      await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setError(factorsError.message);
      setLoading(false);
      return;
    }

    const totpFactor = factorsData?.totp?.[0];
    if (!totpFactor) {
      setError("No authenticator app is enrolled on this account.");
      setLoading(false);
      return;
    }

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: digits.join(""),
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    router.push("/event-manager/home");
    router.refresh();
  }

  const isComplete = digits.every((d) => d.length === 1);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8 text-center">
          <div className="w-14 h-14 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-7 h-7 text-brand-600" strokeWidth={1.6} />
          </div>

          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Two-factor authentication</h1>
          <p className="mt-2 text-sm text-surface-500 leading-relaxed">Enter the 6-digit code from your authenticator app.</p>

          {error && (
            <div className="mt-5 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} className="mt-8">
            <div className="flex items-center justify-center gap-2.5" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-bold border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-surface-50 focus:bg-white transition-all text-surface-900 caret-brand-600"
                  autoComplete="one-time-code"
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !isComplete}
              className="mt-7 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
            >
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Verify"}
            </button>
          </form>

          <div className="mt-6 space-y-2">
            <p className="text-sm text-surface-500">
              Lost access to your authenticator?{" "}
              <Link href="/mfa/backup" className="text-brand-600 font-semibold hover:text-brand-700 transition-colors">
                Use a backup code instead
              </Link>
            </p>
            <div className="pt-1">
              <Link href="/login" className="text-sm text-surface-400 hover:text-surface-600 transition-colors">
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
