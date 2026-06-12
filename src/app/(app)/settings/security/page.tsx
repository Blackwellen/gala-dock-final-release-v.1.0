"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, LogOut, Trash2, Eye, EyeOff } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { cn } from "@/lib/utils";

const INPUT_CLS = "px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

const SESSIONS = [
  { device: "MacBook Pro — Chrome", location: "London, UK", lastActive: "Now", current: true },
  { device: "iPhone 15 — Safari", location: "London, UK", lastActive: "2h ago", current: false },
  { device: "Windows PC — Edge", location: "Manchester, UK", lastActive: "3d ago", current: false },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
        checked ? "bg-brand-600" : "bg-surface-300"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export default function SecuritySettingsPage() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <SettingsShell title="Security" description="Manage your password, two-factor authentication, and active sessions.">
      <div className="max-w-lg space-y-8">
        {/* Password */}
        <div>
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Change password</h2>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Current password</label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" strokeWidth={1.8} /> : <Eye className="w-4 h-4" strokeWidth={1.8} />}
                </button>
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>New password</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" strokeWidth={1.8} /> : <Eye className="w-4 h-4" strokeWidth={1.8} />}
                </button>
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Confirm new password</label>
              <input type="password" placeholder="••••••••" className={INPUT_CLS} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
            >
              Update password
            </button>
            {saved && <span className="text-sm text-success-600 font-medium">Password updated!</span>}
          </div>
        </div>

        {/* MFA */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Two-factor authentication</h2>
          <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {mfaEnabled ? (
                <ShieldCheck className="w-5 h-5 text-success-600 shrink-0" strokeWidth={1.8} />
              ) : (
                <ShieldOff className="w-5 h-5 text-warning-600 shrink-0" strokeWidth={1.8} />
              )}
              <div>
                <p className="text-sm font-medium text-surface-900">
                  {mfaEnabled ? "2FA is enabled" : "2FA is disabled"}
                </p>
                <p className="text-xs text-surface-500 mt-0.5">
                  {mfaEnabled
                    ? "Your account is protected with an authenticator app."
                    : "Enable 2FA to add an extra layer of security."}
                </p>
              </div>
            </div>
            <Toggle checked={mfaEnabled} onChange={() => setMfaEnabled((v) => !v)} />
          </div>
        </div>

        {/* Sessions */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Active sessions</h2>
          <div className="space-y-2">
            {SESSIONS.map((session) => (
              <div
                key={session.device}
                className="flex items-center justify-between p-3 bg-surface-50 border border-surface-200 rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-surface-900">{session.device}</p>
                    {session.current && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-200">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">{session.location} · {session.lastActive}</p>
                </div>
                {!session.current && (
                  <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-50 rounded-lg transition-colors">
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-danger-700 mb-2">Danger zone</h2>
          <p className="text-sm text-surface-500 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-danger-600 hover:bg-danger-700 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" strokeWidth={1.8} />
            Delete account
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}
