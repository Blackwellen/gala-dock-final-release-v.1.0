"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const noop = () => () => {};
const GENERIC = "The email or password you entered is incorrect.";

/**
 * Staff sign-in for the Platform Admin console. Same identity system as the product, separate entry:
 * after password sign-in the account must hold a platform_admins row, then MFA (aal2) is always required.
 */
export function AdminLoginForm({ reason }: { reason?: string }) {
  const router = useRouter();
  const [error, setError] = useState(reason === "insufficient" ? "This account doesn’t have Platform Admin access." : "");
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();
  // Never allow a pre-hydration native submit (it would place credentials in the URL).
  const ready = useSyncExternalStore(noop, () => true, () => false);

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const password = String(data.get("password") ?? "");
    setError("");
    if (!email || !password) { setError("Enter your work email and password."); return; }
    start(async () => {
      const supabase = createClient();
      const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !session.user) { setError(GENERIC); return; }
      await supabase.rpc("log_auth_event", { p_event: "auth.login" });
      // Admins may read other admin rows (permission management), so always scope to the signed-in user.
      const { data: admin } = await supabase.from("platform_admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
      if (!admin) {
        await supabase.auth.signOut({ scope: "local" });
        setError("This account doesn’t have Platform Admin access.");
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const enrolled = (factors?.totp ?? []).some(f => f.status === "verified");
      router.push(`/mfa?next=${encodeURIComponent("/admin")}${enrolled ? "" : "&required=1"}`);
      router.refresh();
    });
  }

  return <form className="adm-login-form" method="post" noValidate onSubmit={e => { e.preventDefault(); submit(e.currentTarget); }} aria-busy={pending}>
    <label className="adm-field"><span>Work email</span>
      <span className="adm-input"><Mail aria-hidden="true" /><input name="email" type="email" autoComplete="username" placeholder="you@galadock.com" required /></span></label>
    <label className="adm-field"><span>Password</span>
      <span className="adm-input"><LockKeyhole aria-hidden="true" /><input name="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span></label>
    {error && <p className="adm-error" role="alert">{error}</p>}
    <button className="adm-submit" type="submit" disabled={pending || !ready}>{pending ? "Signing in…" : "Continue to verification"}</button>
    <p className="adm-note"><ShieldCheck aria-hidden="true" />Two-factor verification is required for every Admin session. All access is audited.</p>
  </form>;
}
