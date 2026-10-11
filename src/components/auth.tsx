"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Users, Sparkles, Mail, LockKeyhole, Eye, EyeOff, ShieldCheck, CircleHelp, Globe, Check, Send, KeyRound, QrCode, RefreshCw, AlertCircle, Clock, UserRound, Ban, Pencil, X, LogIn } from "lucide-react";
import { Logo, Button, IconTile } from "./ui";
import { createClient, setRememberDevice } from "@/lib/supabase/client";
import { assetUrl, hasRegeneratedAsset } from "@/lib/assets";
import { InvitationSummary, type InvitePreview } from "./invitation-details";
import { passwordChecks, passwordStrength } from "@/lib/password";
import type { AuthScreen } from "@/lib/routes";

export type AuthProps = {
  screen: AuthScreen; preview?: boolean; next: string; error?: string; state?: string;
  intent?: { kind: string; title: string; detail: string; href: string } | null;
  providers: ("google" | "azure")[]; email?: string; maskedEmail?: string; signedInEmail?: string | null;
  factors?: { id: string; name: string }[]; invite?: InvitePreview | null; token?: string;
  workspaces?: { id: string; name: string; kind: string }[];
};

const TERMS_VERSION = "2026-10";
const titles: Record<AuthScreen, string> = { login: "Log in", register: "Create your account", "verify-email": "Verify your email", "forgot-password": "Forgot your password?", "reset-password": "Reset your password", mfa: "Multi-factor authentication", invite: "Workspace invite", access: "Secure access" };
const descriptions: Record<AuthScreen, string> = {
  login: "Sign in to Gala Dock and we’ll take you back to your last valid Customer, Organizer, Provider, or Admin destination.",
  register: "Create one Gala Dock identity to access all features — whether you’re an organizer, team member, provider, or attendee.",
  "verify-email": "Please confirm your email address to continue. This helps us keep your account secure and ensures you receive important event updates.",
  "forgot-password": "Enter your email address and we’ll send you a link to reset your password. If an account exists for this email, we’ll send a reset link.",
  "reset-password": "Create a new password for your Gala Dock account. Make sure it’s strong and unique to keep your account secure.",
  mfa: "To keep your account secure, we need a second factor to complete your sign-in.",
  invite: "You’ve been invited to join a Gala Dock workspace. Sign in or create an account to accept the invitation.",
  access: "Your current account doesn’t have access to this workspace. Choose a different workspace, reauthenticate, or contact support if you believe this is a mistake.",
};
const accessCopy: Record<string, [string, string]> = {
  denied: ["Access denied", "You don’t have permission to open this workspace with your current account or role. If you believe you should have access, try a different workspace or contact your organization’s administrator."],
  insufficient: ["Insufficient permission", "Your role doesn’t include this area. Ask a workspace owner to review your permissions."],
  suspended: ["Access suspended", "Access to this workspace is currently suspended. Your other workspaces and your personal account are unaffected."],
  revoked: ["Access revoked", "Your access to this workspace has been removed. Contact the workspace owner if you think this is a mistake."],
  expired: ["Session expired", "For your security, your session has ended. Sign in again to continue."],
};
const resetErrors = (message: string) => /rate|too many/i.test(message) ? "Too many requests. Please wait a minute before trying again." : null;

function useCountdown(initial: number) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return [seconds, setSeconds] as const;
}

function AuthInput({ label, name, type = "text", placeholder, defaultValue, onValueChange, autoComplete, error, aside }: {
  label: string; name: string; type?: string; placeholder?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  autoComplete: string; error?: string; aside?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const Icon = type === "password" ? LockKeyhole : type === "email" ? Mail : UserRound;
  return <div className="auth-field">
    <span><label htmlFor={id}>{label}</label>{aside}</span>
    <div className={error ? "invalid" : ""}>
      <Icon size={21} aria-hidden="true" />
      <input id={id} name={name} type={visible ? "text" : type} placeholder={placeholder} defaultValue={defaultValue} autoComplete={autoComplete}
        onChange={e => onValueChange?.(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        inputMode={type === "email" ? "email" : undefined} spellCheck={type === "email" ? false : undefined} />
      {type === "password" && <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>{visible ? <EyeOff size={21} /> : <Eye size={21} />}</button>}
    </div>
    {error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}
  </div>;
}

/** Read-only state indicator styled like the design's segmented control. It reflects server state; it is not a toggle. */
function StatusSteps({ items, active, label }: { items: { key: string; label: string; icon: ReactNode }[]; active: string; label: string }) {
  return <div className="segmented status-steps" role="status" aria-label={label}>
    {items.map(item => <span key={item.key} className={item.key === active ? "active" : ""} aria-current={item.key === active ? "step" : undefined}>{item.icon} {item.label}</span>)}
  </div>;
}

function SocialButtons({ next, providers, onError }: { next: string; providers: AuthProps["providers"]; onError: (message: string) => void }) {
  if (!providers.length) return null;
  async function login(provider: "google" | "azure") {
    const { error } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next || "/continue")}`, scopes: provider === "azure" ? "email" : undefined } });
    if (error) onError("We couldn’t start sign-in with that provider. Please try again.");
  }
  return <div className="social-buttons">
    {providers.includes("google") && <Button variant="outline" onClick={() => login("google")}><span className="google-g" aria-hidden="true">G</span>Continue with Google</Button>}
    {providers.includes("azure") && <Button variant="outline" onClick={() => login("azure")}><span className="ms-mark" aria-hidden="true"><i /><i /><i /><i /></span>Continue with Microsoft</Button>}
  </div>;
}

function PasswordRules({ value, strength = false }: { value: string; strength?: boolean }) {
  const checks = passwordChecks(value);
  const met = checks.filter(c => c.met).length;
  const score = passwordStrength(value);
  return <div className="auth-hint" aria-live="polite">
    <div><b>Your password must:</b><span>{met} of {checks.length} met</span></div>
    {strength && value && <div className={`strength strength-${score.level}`}><i style={{ width: `${score.percent}%` }} /><span>{score.label}</span></div>}
    <ul>{checks.map(rule => <li key={rule.label} className={rule.met ? "met" : ""}><span aria-hidden="true" /> {rule.label}<span className="sr-only">{rule.met ? " (met)" : " (not met)"}</span></li>)}</ul>
  </div>;
}

export function AuthPage(props: AuthProps) {
  const { screen, preview = false, next, intent, providers } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Submitting before hydration would fall back to a native form submit; keep it disabled until JS is ready.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [error, setError] = useState(props.error ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [state, setState] = useState(props.state ?? "");
  const [password, setPassword] = useState("");
  const [cooldown, setCooldown] = useCountdown(screen === "verify-email" && props.state === "waiting" ? 30 : 0);
  const [method, setMethod] = useState<"authenticator" | "recovery">("authenticator");
  const [factorId, setFactorId] = useState(props.factors?.[0]?.id ?? "");
  const [enrolment, setEnrolment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const continueHref = `/continue${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const withNext = (path: string) => `${path}${next ? `${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : ""}`;

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function fail(message: string, fields: Record<string, string> = {}) {
    setFieldErrors(fields);
    setError(message);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError(""); setNotice(""); setFieldErrors({});
    if (preview) { setNotice("Preview only — sign in on the live page to continue."); return; }
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const supabase = createClient();
    setBusy(true);
    try {
      if (screen === "login") {
        const fields: Record<string, string> = {};
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = "Enter a valid email address.";
        if (!form.get("password")) fields.password = "Enter your password.";
        if (Object.keys(fields).length) return fail("Please check the highlighted fields.", fields);
        setRememberDevice(form.get("remember") === "on");
        const { error } = await supabase.auth.signInWithPassword({ email, password: String(form.get("password")) });
        if (error) {
          if (/not confirmed/i.test(error.message)) return router.push(withNext(`/verify-email?email=${encodeURIComponent(email)}`));
          return fail(resetErrors(error.message) ?? "The email or password you entered is incorrect.");
        }
        await supabase.rpc("log_auth_event", { p_event: "auth.login" });
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        router.replace(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" ? withNext("/mfa") : continueHref);
        router.refresh();
      } else if (screen === "register") {
        const fullName = String(form.get("full_name") ?? "").trim();
        const fields: Record<string, string> = {};
        if (fullName.length < 2) fields.full_name = "Enter your full name.";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = "Enter a valid email address.";
        if (!passwordChecks(password).every(c => c.met)) fields.password = "Your password doesn’t meet all the requirements yet.";
        if (form.get("terms") !== "on") fields.terms = "You need to agree to the Terms of Service and Privacy Policy.";
        if (Object.keys(fields).length) return fail("Please check the highlighted fields.", fields);
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { full_name: fullName.slice(0, 100), terms_version: TERMS_VERSION, marketing_opt_in: form.get("marketing") === "on" },
            emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(withNext("/verify-email"))}`,
          },
        });
        if (error) return fail(resetErrors(error.message) ?? (/password/i.test(error.message) ? "Choose a stronger password." : "We couldn’t create your account. Please try again."));
        // The same neutral next step is shown whether or not the address was already registered.
        router.push(data.session ? continueHref : withNext(`/verify-email?email=${encodeURIComponent(email)}`));
      } else if (screen === "forgot-password") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Enter a valid email address.", { email: "Enter a valid email address." });
        if (cooldown > 0) return;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
        const limited = error && resetErrors(error.message);
        if (limited) return fail(limited);
        setCooldown(60);
        setState("sent");
        setNotice("If an account exists for this email, you’ll receive a reset link shortly.");
      } else if (screen === "reset-password") {
        if (!passwordChecks(password).every(c => c.met)) return fail("Please meet all of the password requirements.", { password: "Doesn’t meet all requirements yet." });
        if (form.get("confirm") !== password) return fail("Your passwords don’t match.", { confirm: "Passwords don’t match." });
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return fail(/same/i.test(error.message) ? "Choose a password you haven’t used before." : "Your reset link has expired. Request a new one.");
        await supabase.rpc("log_auth_event", { p_event: "auth.password_reset" });
        // Sign out every session, including this one, so the new password is required everywhere.
        await supabase.auth.signOut({ scope: "global" });
        setState("complete");
      } else if (screen === "verify-email") {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return router.push(withNext("/login"));
        if (!data.user.email_confirmed_at) return fail("Your email isn’t verified yet. Open the link we sent you, then try again.");
        router.push(continueHref);
      } else if (screen === "mfa") {
        if (method === "recovery") return;
        if (!/^\d{6}$/.test(code)) return fail("Enter the six-digit code from your authenticator app.");
        const id = enrolment?.id ?? factorId;
        if (!id) return fail("Set up an authenticator app first.");
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
        if (error) { setCode(""); return fail(/expired/i.test(error.message) ? "That code has expired. Enter the latest code from your app." : resetErrors(error.message) ?? "That code isn’t valid. Check your app and try again."); }
        await supabase.rpc("log_auth_event", { p_event: enrolment ? "auth.mfa_enrolled" : "auth.mfa_verified" });
        router.replace(continueHref);
        router.refresh();
      } else if (screen === "invite") {
        await respondToInvite(true);
      } else if (screen === "access") {
        const workspace = props.workspaces?.find(w => w.id === form.get("workspace"));
        if (!workspace) return fail("Choose a workspace you belong to.");
        router.push(`/${workspace.kind}`);
      }
    } catch {
      fail("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function respondToInvite(accept: boolean) {
    if (preview) { setNotice("Preview only — open a real invitation link to respond."); return; }
    if (!props.signedInEmail) { router.push(`/login?next=${encodeURIComponent(next)}`); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: props.token, accept }) });
      const data = await response.json();
      if (!response.ok) { if (data.result) setState(data.result); return fail(data.error); }
      router.push(data.next); router.refresh();
    } catch {
      fail("Something went wrong. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  async function resend() {
    if (preview || cooldown > 0) return;
    if (!props.email) return fail("Go back and enter your email address again.");
    const { error } = await createClient().auth.resend({ type: "signup", email: props.email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(withNext("/verify-email"))}` } });
    // Resend responses are neutral; only rate limits are surfaced.
    const limited = error && resetErrors(error.message);
    if (limited) fail(limited); else { setCooldown(60); setNotice("If this address is awaiting verification, a new email is on its way."); }
  }

  async function enroll() {
    setError("");
    const { data, error } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: `Gala Dock ${new Date().toISOString().slice(0, 10)}` });
    if (error) return fail("We couldn’t start authenticator setup. Please try again.");
    setEnrolment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function switchAccount() {
    if (!preview) await createClient().auth.signOut();
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  const storyName = `auth-art-${screen === "access" ? "secure-access" : screen}`;
  const inviteBlocked = screen === "invite" && state !== "valid";
  const submitLabel: Record<AuthScreen, string> = {
    login: "Log in", register: "Create account", "verify-email": "Continue", "forgot-password": state === "sent" ? "Resend reset link" : "Send reset link",
    "reset-password": "Save new password", mfa: enrolment ? "Verify and turn on" : "Verify",
    invite: props.signedInEmail ? "Accept invite" : "Sign in to accept", access: "Switch workspace",
  };
  const showForm = !(screen === "reset-password" && (state === "complete" || state === "expired")) && !(screen === "mfa" && method === "recovery")
    && !(screen === "verify-email" && state === "expired") && !(screen === "access" && state === "expired") && !(screen === "access" && !props.workspaces?.length);
  const [accessTitle, accessText] = accessCopy[state] ?? accessCopy.denied;

  return <div className={`auth-page auth-${screen === "access" ? "secure-access" : screen}`}>
    <div className="auth-main">
      <aside className={`auth-story ${hasRegeneratedAsset(storyName) ? "regenerated-story" : ""}`} style={{ backgroundImage: `url(${assetUrl(storyName, "png")})` }}>
        <Logo light />
        <div className="story-content">
          <p className="eyebrow">EVENTS BRING PEOPLE TOGETHER</p>
          <h1>{screen === "register" ? <>Turn your<br />next event<br />into something<br /><em>extraordinary.</em></> : <>Extraordinary<br />events <em>start here.</em></>}</h1>
          <p className="story-description">{screen === "register" ? "Create your Gala Dock account to plan, manage, and be part of unforgettable events — all in one connected platform." : "Gala Dock gives organizers, teams, and creators the tools to plan, manage, and grow unforgettable experiences — all in one place."}</p>
          <div className="story-features">{([
            [CalendarDays, screen === "register" ? "One account for everything" : "Power every event", screen === "register" ? "Access tools as an organizer, team member, provider, or attendee." : "From intimate gatherings to global experiences."],
            [Users, screen === "register" ? "More opportunities" : "Built for every role", screen === "register" ? "Plan events, grow your network, and discover amazing experiences." : "Organizers, customers, providers, and admins."],
            [Sparkles, "A more connected future", "Events create opportunity, community, and growth."],
          ] as const).map(([Icon, title, text]) => <div key={title}><IconTile icon={Icon} color="purple" /><span><b>{title}</b><p>{text}</p></span></div>)}</div>
        </div>
        <div className="story-stats"><div><b>1</b><span>Account, every role</span></div><div><b>3</b><span>Experiences</span></div><div><b>MFA</b><span>Protected sign-in</span></div></div>
      </aside>
      <main className="auth-right">
        {screen !== "mfa" && screen !== "forgot-password" && <div className="auth-top">
          <span>{screen === "register" ? "Already have an account?" : screen === "access" ? "Need help?" : "New to Gala Dock?"}</span>
          <Button variant="outline" href={screen === "register" ? withNext("/login") : screen === "access" ? "/help" : withNext("/register")} arrow>{screen === "register" ? "Log in" : screen === "access" ? "Visit our Help Center" : "Create an account"}</Button>
        </div>}
        <section className="auth-card" aria-labelledby="auth-title">
          <Logo />
          <h2 id="auth-title">{screen === "reset-password" && state === "complete" ? "Password updated" : titles[screen]}</h2>
          {screen === "verify-email" && <p className="verify-address">{state === "verified" ? "Your email address is verified" : "We’ve sent a verification link to"}<br /><b>{props.maskedEmail || "your email address"}</b></p>}
          <p className="auth-description">{screen === "reset-password" && state === "complete" ? "Your password has been changed and you’ve been signed out of all devices. Sign in again with your new password." : descriptions[screen]}</p>

          {screen === "verify-email" && <StatusSteps label="Verification status" active={state} items={[
            { key: "waiting", label: "Waiting", icon: <Mail size={17} /> }, { key: "verified", label: "Verified", icon: <Check size={17} /> }, { key: "expired", label: "Expired", icon: <Clock size={17} /> }]} />}
          {screen === "reset-password" && <StatusSteps label="Reset link status" active={state} items={[
            { key: "valid", label: "Valid", icon: <KeyRound size={21} /> }, { key: "expired", label: "Expired", icon: <Clock size={21} /> }, { key: "complete", label: "Complete", icon: <Check size={21} /> }]} />}
          {screen === "access" && <StatusSteps label="Access status" active={["suspended", "revoked"].includes(state) ? state : "denied"} items={[
            { key: "denied", label: "Denied", icon: <Ban size={22} /> }, { key: "suspended", label: "Suspended", icon: <Clock size={22} /> }, { key: "revoked", label: "Revoked", icon: <LockKeyhole size={22} /> }]} />}

          {intent && ["login", "register", "mfa", "verify-email"].includes(screen) && <Link href={intent.href} className="return-banner">
            <IconTile icon={CalendarDays} color="purple" /><span><b>{intent.title}</b><small>{intent.detail}</small></span><ArrowRight aria-hidden="true" />
          </Link>}

          <form method="post" onSubmit={submit} aria-busy={busy} noValidate>
            {screen === "register" && <AuthInput label="Full name" name="full_name" placeholder="Your full name" autoComplete="name" error={fieldErrors.full_name} />}
            {["login", "register", "forgot-password"].includes(screen) && <AuthInput label="Email" name="email" type="email" placeholder="you@company.com" defaultValue={props.email} autoComplete="email" error={fieldErrors.email} />}
            {screen === "login" && <AuthInput label="Password" name="password" type="password" placeholder="Enter your password" autoComplete="current-password" error={fieldErrors.password} aside={<Link href="/forgot-password">Forgot password?</Link>} />}
            {screen === "register" && <><AuthInput label="Password" name="password" type="password" placeholder="Create a password" autoComplete="new-password" onValueChange={setPassword} error={fieldErrors.password} />
              {password ? <PasswordRules value={password} strength /> : <p className="password-hint">Use at least 8 characters with a mix of letters, numbers, and symbols.</p>}
              <label className={`check-row ${fieldErrors.terms ? "invalid" : ""}`}><input name="terms" type="checkbox" aria-invalid={!!fieldErrors.terms} /><span>I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link> ↗</span></label>
              {fieldErrors.terms && <small className="field-error" role="alert">{fieldErrors.terms}</small>}
              <label className="check-row"><input name="marketing" type="checkbox" /><span>Send me product updates, event insights, and special offers (from Gala Dock) (optional).</span></label></>}
            {screen === "reset-password" && state === "valid" && <><AuthInput label="New password" name="password" type="password" placeholder="Enter your new password" autoComplete="new-password" onValueChange={setPassword} error={fieldErrors.password} />
              <AuthInput label="Confirm new password" name="confirm" type="password" placeholder="Confirm your new password" autoComplete="new-password" error={fieldErrors.confirm} />
              <PasswordRules value={password} strength />
              <div className="auth-security reset-security"><ShieldCheck aria-hidden="true" /><span><b>For your security</b><small>After you reset your password, you’ll be signed out on all devices.</small></span></div></>}
            {screen === "login" && <label className="check-row"><input name="remember" type="checkbox" defaultChecked /><span>Remember this device</span><span className="tooltip-anchor" tabIndex={0} aria-label="When unchecked, you’ll be signed out when you close your browser."><CircleHelp size={15} aria-hidden="true" /></span></label>}
            {screen === "forgot-password" && <div className="auth-note"><IconTile icon={Send} color="purple" /><span><b>If an account exists for this email,</b><small>we’ll send a reset link with further instructions.</small></span></div>}

            {screen === "verify-email" && state !== "expired" && <>
              <div className="auth-note"><Mail aria-hidden="true" /><span><b>{state === "verified" ? "Email verified" : "Verification email sent"}</b><small>{state === "verified" ? "You can continue to where you left off." : "Check your inbox and spam folder for a message from Gala Dock with a confirmation link."}</small></span></div>
              {state === "waiting" && <div className="resend-row"><RefreshCw size={20} aria-hidden="true" /><span aria-live="polite">{cooldown ? `Resend available in 00:${String(cooldown).padStart(2, "0")}` : "Haven’t received your email?"}<small>To prevent spam, you can request a new email shortly.</small></span><Button variant="soft" disabled={cooldown > 0} onClick={resend}>Resend email</Button></div>}
              {state === "waiting" && <Button variant="outline" href={withNext(`/register${props.email ? `?email=${encodeURIComponent(props.email)}` : ""}`)} className="full-width"><Pencil size={18} aria-hidden="true" />Change email address</Button>}
            </>}

            {screen === "mfa" && <>
              <div className="segmented" role="tablist" aria-label="Verification method">
                <button type="button" role="tab" aria-selected={method === "authenticator"} className={method === "authenticator" ? "active" : ""} onClick={() => setMethod("authenticator")}><QrCode size={20} aria-hidden="true" /> Authenticator</button>
                <button type="button" role="tab" aria-selected={method === "recovery"} className={method === "recovery" ? "active" : ""} onClick={() => setMethod("recovery")}><KeyRound size={20} aria-hidden="true" /> Recovery code</button>
              </div>
              {method === "authenticator" && <>
                {props.state === "required" && !props.factors?.length && !enrolment && <p className="auth-note"><ShieldCheck aria-hidden="true" /><span><b>Two-step verification is required</b><small>This area requires an authenticator app. Set one up to continue.</small></span></p>}
                {(props.factors?.length ?? 0) > 1 && !enrolment && <label className="field"><span>Authenticator</span><select value={factorId} onChange={e => setFactorId(e.target.value)}>{props.factors!.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
                <h3>{enrolment ? "Scan, then enter your code" : "Enter your code"}</h3>
                <p className="auth-description">{enrolment ? "Scan this QR code with Google Authenticator, Microsoft Authenticator or 1Password, then enter the 6-digit code it shows." : "Open your authenticator app (e.g. Google Authenticator, Microsoft Authenticator) and enter the 6-digit code."}</p>
                {enrolment && <div className="qr-block">{/* QR SVG comes from Supabase Auth, not user input. */}<img src={enrolment.qr} alt="Authenticator setup QR code" width={164} height={164} /><small>Can’t scan? Enter this key: <code>{enrolment.secret}</code></small></div>}
                <OtpInput value={code} onChange={setCode} invalid={!!error} />
                {!props.factors?.length && !enrolment && <Button variant="outline" onClick={enroll} className="full-width">Set up an authenticator app</Button>}
              </>}
              {method === "recovery" && <div className="auth-note"><KeyRound aria-hidden="true" /><span><b>Recovery codes aren’t available yet</b><small>Gala Dock doesn’t issue recovery codes. If you’ve lost access to your authenticator, contact support — we’ll verify your identity before restoring access.</small></span></div>}
            </>}

            {screen === "invite" && <><InvitationSummary invite={props.invite ?? null} />
              {state === "valid" && <div className="auth-security invitation-security"><ShieldCheck aria-hidden="true" /><span><b>This invite is single-use.</b><small>Accepting will add you to this workspace with the {props.invite?.role ?? "assigned"} role. It won’t remove or replace your existing workspace access.</small></span><Link href="/help">Learn more <ArrowRight size={13} /></Link></div>}
              {props.signedInEmail && state === "valid" && <p className="signed-in-as">Signed in as <b>{props.signedInEmail}</b></p>}</>}

            {screen === "access" && <><div className="auth-note danger"><IconTile icon={Ban} color="red" /><span><b>{accessTitle}</b><small>{accessText}</small></span></div>
              {state !== "expired" && !!props.workspaces?.length && <label className="field"><span>Workspace</span><select name="workspace" defaultValue=""><option value="" disabled>Select a workspace</option>{props.workspaces.map(w => <option value={w.id} key={w.id}>{w.name} · {w.kind === "provider" ? "Provider" : "Organizer"}</option>)}</select></label>}</>}

            <p className="form-error" role="alert" tabIndex={-1} ref={errorRef} hidden={!error}><AlertCircle size={18} aria-hidden="true" />{error}</p>
            {notice && <p className="form-success" role="status"><Check size={18} aria-hidden="true" />{notice}</p>}

            {showForm && !inviteBlocked && <Button type="submit" disabled={!hydrated || busy || (screen === "forgot-password" && cooldown > 0)} arrow className="full-width">
              {busy ? "Please wait…" : screen === "forgot-password" && cooldown > 0 ? `Resend available in ${cooldown}s` : submitLabel[screen]}
            </Button>}
          </form>

          {screen === "reset-password" && state === "complete" && <Button href="/login" arrow className="full-width"><LogIn size={18} aria-hidden="true" />Log in with new password</Button>}
          {screen === "reset-password" && state === "expired" && <div className="auth-note danger"><IconTile icon={Clock} color="red" /><span><b>This reset link is invalid or has expired</b><small>Reset links can be used once and expire after a short time. Request a new link to continue.</small></span></div>}
          {screen === "verify-email" && state === "expired" && <><div className="auth-note danger"><IconTile icon={Clock} color="red" /><span><b>Verification link expired</b><small>This link is no longer valid. Sign in to request a new verification email.</small></span></div><Button href={withNext("/login")} arrow className="full-width">Sign in to resend</Button></>}
          {["login", "register"].includes(screen) && providers.length > 0 && <><div className="auth-divider">{screen === "login" ? "Use another method" : "Or continue with"}</div><SocialButtons next={next} providers={providers} onError={setError} /></>}
          {screen === "reset-password" && state !== "complete" && <><div className="auth-divider">or</div><Link className="request-new-link" href="/forgot-password">Request new link</Link></>}
          {screen === "forgot-password" && <Link className="auth-back" href="/login">← Back to Log in</Link>}
          {screen === "mfa" && <><div className="auth-divider">Or try a different method</div><Button variant="outline" className="full-width" onClick={() => setMethod(method === "authenticator" ? "recovery" : "authenticator")}><RefreshCw size={20} aria-hidden="true" />Switch method</Button>
            <form action={`/auth/signout${next ? `?next=${encodeURIComponent(next)}` : ""}`} method="post"><button className="text-link" type="submit">Sign out and use another account</button></form></>}
          {screen === "invite" && state === "valid" && <div className="social-buttons">
            {props.signedInEmail ? <Button variant="outline" onClick={() => respondToInvite(false)} disabled={busy}><X size={18} aria-hidden="true" />Decline</Button> : <Button variant="outline" href={`/register?next=${encodeURIComponent(next)}`}><UserRound size={18} aria-hidden="true" />Create account</Button>}
            <Button variant="outline" onClick={switchAccount}><UserRound size={18} aria-hidden="true" />Use another account</Button>
          </div>}
          {screen === "invite" && state !== "valid" && <div className="invitation-expired" role="status"><Clock size={26} aria-hidden="true" /><span><b>{({ expired: "This invite has expired", used: "This invite has already been used", declined: "This invite was declined", revoked: "This invite is no longer valid", mismatch: "This invite belongs to another account" } as Record<string, string>)[state] ?? "This invite is unavailable"}</b>
            <small>{state === "expired" && props.invite ? `This invitation expired on ${new Date(props.invite.expires_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })} and can no longer be used.` : state === "mismatch" ? "Switch to the email address the invitation was sent to." : "Ask the workspace owner to send you a new invitation."}</small></span>
            {state === "mismatch" && <Button variant="outline" onClick={switchAccount}>Switch account</Button>}</div>}
          {screen === "access" && <div className="social-buttons">
            <form action={`/auth/signout${next ? `?next=${encodeURIComponent(next)}` : ""}`} method="post"><Button variant="outline" type="submit" className="full-width"><RefreshCw size={18} aria-hidden="true" />Reauthenticate</Button></form>
            <Button variant="outline" href="/help"><CircleHelp size={18} aria-hidden="true" />Contact support</Button>
          </div>}
          {screen === "access" && <Link className="auth-back" href={props.signedInEmail ? "/discover" : "/login"}>← Return to {props.signedInEmail ? "Discover" : "Log in"}</Link>}

          {!["reset-password", "verify-email", "invite"].includes(screen) && <div className="auth-security"><ShieldCheck aria-hidden="true" /><span><b>{screen === "register" ? "You’ll verify your email once." : screen === "access" ? "Your data stays protected." : "Secure, always."}</b><small>{screen === "register" ? "Then you can continue to your original destination and pick up right where you left off." : screen === "access" ? "To protect the privacy and security of our customers, we don’t reveal whether a specific workspace or record exists." : "Your data is protected with enterprise-grade security, including optional multi-factor authentication (MFA)."}</small></span>{screen !== "register" && <Link href="/help">Learn more <ArrowRight size={13} /></Link>}</div>}
          {!["register", "reset-password", "invite"].includes(screen) && <div className="auth-help"><CircleHelp size={17} aria-hidden="true" /><span>Need help?</span><Link href="/help">Visit our Help Center</Link><i /> <Link href="/help">Contact Support</Link></div>}
        </section>
      </main>
    </div>
    <footer className="auth-footer"><span>© {new Date().getFullYear()} Gala Dock. All rights reserved.</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/help">Security</Link><Link href="/help">Help Center</Link><span className="auth-footer-motto">Events create a brighter, more connected world. <Globe size={18} aria-hidden="true" /></span></footer>
  </div>;
}

/** Six segmented boxes backed by one accessible value; supports typing, paste, backspace and arrows. */
function OtpInput({ value, onChange, invalid }: { value: string; onChange: (value: string) => void; invalid: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (index: number, digit: string) => {
    const chars = value.padEnd(6, " ").split("");
    chars[index] = digit || " ";
    onChange(chars.join("").replace(/\s+$/, "").replace(/ /g, ""));
  };
  return <fieldset className="otp-inputs" aria-label="Six-digit authentication code">
    {Array.from({ length: 6 }, (_, i) => <input key={i} ref={el => { refs.current[i] = el; }} aria-label={`Digit ${i + 1}`} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
      maxLength={1} placeholder={String(i + 1)} value={value[i] ?? ""} aria-invalid={invalid}
      onChange={e => { const digit = e.target.value.replace(/\D/g, "").slice(-1); set(i, digit); if (digit) refs.current[i + 1]?.focus(); }}
      onKeyDown={e => {
        if (e.key === "Backspace" && !value[i]) refs.current[i - 1]?.focus();
        if (e.key === "ArrowLeft") refs.current[i - 1]?.focus();
        if (e.key === "ArrowRight") refs.current[i + 1]?.focus();
      }}
      onPaste={e => { const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6); if (digits) { e.preventDefault(); onChange(digits); refs.current[Math.min(digits.length, 5)]?.focus(); } }} />)}
  </fieldset>;
}
