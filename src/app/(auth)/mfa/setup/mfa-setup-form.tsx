"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, AlertCircle, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface EnrolledFactor {
  id: string;
  status: string;
  friendlyName?: string | null;
}

/**
 * Real MFA enrollment using Supabase Auth's own MFA APIs (auth.mfa.enroll /
 * challenge / verify / unenroll) — no separate schema needed, Supabase manages
 * factors server-side. Mirrors the challenge/verify flow already used at
 * /mfa (mfa-form.tsx) for the sign-in-time check.
 */
export function MfaSetupForm() {
  const [factors, setFactors] = useState<EnrolledFactor[]>([]);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function loadFactors() {
    setLoadingFactors(true);
    const supabase = createClient();
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (!listError && data) {
      setFactors(data.totp.map((f) => ({ id: f.id, status: f.status, friendlyName: f.friendly_name })));
    }
    setLoadingFactors(false);
  }

  useEffect(() => {
    queueMicrotask(() => void loadFactors());
  }, []);

  async function startEnrollment() {
    setEnrolling(true);
    setError(null);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (enrollError) {
      setError(enrollError.message);
      setEnrolling(false);
      return;
    }
    setPendingFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function verifyAndActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingFactorId || code.length < 6) return;
    setVerifying(true);
    setError(null);

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: pendingFactorId,
    });
    if (challengeError) {
      setError(challengeError.message);
      setVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: pendingFactorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError(verifyError.message);
      setVerifying(false);
      return;
    }

    setSuccess(true);
    setQrCode(null);
    setSecret(null);
    setPendingFactorId(null);
    setCode("");
    setVerifying(false);
    await loadFactors();
  }

  async function removeFactor(factorId: string) {
    setError(null);
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    if (unenrollError) {
      setError(unenrollError.message);
      return;
    }
    await loadFactors();
  }

  const hasVerifiedFactor = factors.some((f) => f.status === "verified");

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <div className="w-14 h-14 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-7 h-7 text-brand-600" strokeWidth={1.6} />
          </div>

          <h1 className="text-2xl font-bold text-surface-900 tracking-tight text-center">
            Two-factor authentication
          </h1>
          <p className="mt-2 text-sm text-surface-500 leading-relaxed text-center">
            Add an authenticator app for an extra layer of account security. Optional, but
            recommended.
          </p>

          {error && (
            <div className="mt-5 flex items-center gap-2.5 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              {error}
            </div>
          )}

          {success && (
            <div className="mt-5 flex items-center gap-2.5 px-4 py-3 bg-success-50 border border-success-200 rounded-lg text-sm text-success-700 text-left">
              <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              Authenticator app enabled.
            </div>
          )}

          {loadingFactors ? (
            <div className="mt-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-surface-400" />
            </div>
          ) : hasVerifiedFactor ? (
            <div className="mt-8 space-y-3">
              {factors
                .filter((f) => f.status === "verified")
                .map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-surface-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-success-600" strokeWidth={1.8} />
                      <span className="text-sm text-surface-700">Authenticator app enabled</span>
                    </div>
                    <button
                      onClick={() => removeFactor(f.id)}
                      className="p-1.5 text-surface-400 hover:text-danger-600 hover:bg-danger-50 rounded transition-colors"
                      aria-label="Remove authenticator app"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                ))}
            </div>
          ) : qrCode ? (
            <form onSubmit={verifyAndActivate} className="mt-8">
              <div className="flex flex-col items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="Scan this QR code with your authenticator app" className="w-40 h-40 rounded-lg border border-surface-200" />
                {secret && (
                  <p className="mt-3 text-xs text-surface-400 font-mono break-all text-center">{secret}</p>
                )}
              </div>
              <label className="block text-sm font-medium text-surface-700 mt-6 mb-1.5">
                Enter the 6-digit code from your app
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center tracking-[0.5em] py-2.5 px-4 text-lg font-semibold border border-surface-200 rounded-lg bg-surface-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
                autoFocus
              />
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
              >
                {verifying ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Verify & activate"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={startEnrollment}
              disabled={enrolling}
              className="mt-8 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
            >
              {enrolling ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Set up authenticator app"}
            </button>
          )}

          <div className="mt-6 text-center">
            <Link href="/event-manager/settings/account" className="text-sm text-surface-400 hover:text-surface-600 transition-colors">
              Back to account settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
