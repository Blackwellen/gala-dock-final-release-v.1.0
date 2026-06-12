"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound } from "lucide-react";

const CODE_LENGTH = 6;

export default function OtpForm() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
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
    await new Promise((r) => setTimeout(r, 800));
    router.push("/home");
  }

  async function handleResend() {
    setResending(true);
    await new Promise((r) => setTimeout(r, 800));
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  }

  const isComplete = digits.every((d) => d.length === 1);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8 text-center">
          <div className="w-14 h-14 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-6">
            <KeyRound className="w-7 h-7 text-brand-600" strokeWidth={1.6} />
          </div>

          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Enter your one-time code</h1>
          <p className="mt-2 text-sm text-surface-500 leading-relaxed">
            Enter the 6-digit code sent to your email address.
          </p>

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
                  autoComplete={i === 0 ? "one-time-code" : "off"}
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

          <div className="mt-6 text-sm text-surface-500">
            Didn&apos;t receive a code?{" "}
            {resent ? (
              <span className="text-success-600 font-medium">Code sent!</span>
            ) : (
              <button onClick={handleResend} disabled={resending} className="text-brand-600 font-semibold hover:text-brand-700 disabled:opacity-50 transition-colors">
                {resending ? "Sending..." : "Resend code"}
              </button>
            )}
          </div>

          <div className="mt-4">
            <Link href="/login" className="text-sm text-surface-400 hover:text-surface-600 transition-colors">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
