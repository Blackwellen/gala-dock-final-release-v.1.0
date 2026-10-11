"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ShieldCheck, KeyRound, Trash2, Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { generateRecoveryCodes, recordFactorChange, setWorkspaceMfaPolicy } from "@/lib/mfa/actions";

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };
const box: React.CSSProperties = { display: "grid", gap: 10 };
const btn = "k-btn outline", primary = "k-btn";

/**
 * Two-step verification self-service (release spec §7–8): authenticator setup, removal, recovery codes. Removing a factor or
 * generating codes needs a fresh second-factor verification — Supabase enforces aal2 for unenrol, the server action for codes.
 */
export function MfaCard({ required }: { required?: string | null }) {
  const [sb] = useState(createClient);
  const [factors, setFactors] = useState<Factor[] | null>(null), [aal, setAal] = useState<string>("aal1"), [remaining, setRemaining] = useState<number | null>(null);
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null), [code, setCode] = useState(""), [verifyFor, setVerifyFor] = useState<null | "remove" | "codes">(null);
  const [codes, setCodes] = useState<string[] | null>(null), [err, setErr] = useState(""), [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const load = useCallback(async () => {
    const [{ data: f }, { data: a }, { data: n }] = await Promise.all([sb.auth.mfa.listFactors(), sb.auth.mfa.getAuthenticatorAssuranceLevel(), sb.rpc("my_recovery_code_count" as never)]);
    setFactors((f?.totp ?? []) as Factor[]); setAal(a?.currentLevel ?? "aal1"); setRemaining(typeof n === "number" ? n : null);
  }, [sb]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const verified = factors?.filter(f => f.status === "verified") ?? [];

  const verify = async (factorId: string) => {
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) { setErr("That code didn’t work — use the latest 6-digit code from your app."); return false; }
    setCode(""); return true;
  };
  const begin = () => start(async () => {
    setErr(""); setMsg("");
    for (const f of factors ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });   // clear abandoned setups
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) { setErr("Couldn’t start setup. Try again."); return; }
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  });
  const confirmEnrol = () => start(async () => {
    setErr(""); if (!enrol || !(await verify(enrol.id))) return;
    setEnrol(null); await recordFactorChange("enrolled"); await load();
    const r = await generateRecoveryCodes(); if (r.ok) setCodes(r.data!);
    setMsg("Two-step verification is on. Save your recovery codes somewhere safe.");
  });
  const stepThen = (what: "remove" | "codes") => start(async () => {
    setErr(""); setMsg("");
    if (aal !== "aal2" || verifyFor === what) {
      if (verifyFor !== what) { setVerifyFor(what); return; }
      if (!(await verify(verified[0]!.id))) return;
    }
    setVerifyFor(null);
    if (what === "codes") { const r = await generateRecoveryCodes(); if (r.ok) { setCodes(r.data!); await load(); } else setErr(r.error); return; }
    if (required) { setErr(`${required} requires two-step verification, so it can’t be turned off. Add a new authenticator first if you’re replacing one.`); return; }
    for (const f of verified) { const { error } = await sb.auth.mfa.unenroll({ factorId: f.id }); if (error) { setErr("Verify with your authenticator, then try again."); setVerifyFor("remove"); return; } }
    await recordFactorChange("removed"); await sb.auth.refreshSession(); await load(); setMsg("Two-step verification is off.");
  });
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`Gala Dock recovery codes\nEach code works once.\n\n${codes!.join("\n")}\n`], { type: "text/plain" })); a.download = "gala-dock-recovery-codes.txt"; a.click(); };

  return <section className="ce-card ac-card" id="mfa" style={box} aria-labelledby="mfa-h">
    <h2 id="mfa-h" style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={18} aria-hidden="true" />Two-step verification</h2>
    {required && !verified.length && <p role="alert" style={{ margin: 0, padding: "8px 10px", borderRadius: 8, background: "#fff2df", color: "#7a4100", fontWeight: 600 }}>{required} requires two-step verification. Set it up to continue.</p>}
    {factors === null ? <p className="ac-hint"><Loader2 size={14} className="mk-spin" /> Loading…</p> : verified.length ? <>
      <p className="ac-hint">On — you’ll enter a code from your authenticator app when you sign in and before sensitive actions.</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{verified.map(f => <li key={f.id}>{f.friendly_name || "Authenticator app"} · added {new Date(f.created_at).toLocaleDateString("en-GB")}</li>)}</ul>
      <p className="ac-hint">Recovery codes left: <b>{remaining ?? "—"}</b>{remaining === 0 && " — generate new ones so you can’t get locked out."}</p>
      {verifyFor && <label style={{ display: "grid", gap: 4, maxWidth: 220 }}><span className="ac-hint">Authenticator code to confirm</span><input className="k-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} autoFocus /></label>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className={btn} disabled={pending} onClick={() => stepThen("codes")}><KeyRound size={15} />{verifyFor === "codes" ? "Confirm and generate" : "New recovery codes"}</button>
        <button type="button" className={btn} disabled={pending} onClick={() => stepThen("remove")}><Trash2 size={15} />{verifyFor === "remove" ? "Confirm and turn off" : "Turn off"}</button>
      </div>
    </> : enrol ? <>
      <p className="ac-hint">Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password or similar, then enter the 6-digit code.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrol.qr} alt="Authenticator QR code" width={168} height={168} style={{ background: "#fff", borderRadius: 8 }} />
      <p className="ac-hint">Can’t scan? Enter this key: <code style={{ userSelect: "all", wordBreak: "break-all" }}>{enrol.secret}</code></p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <input className="k-input" style={{ maxWidth: 160 }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} aria-label="6-digit code" />
        <button type="button" className={primary} disabled={pending || code.length !== 6} onClick={confirmEnrol}>{pending && <Loader2 size={14} className="mk-spin" />}Verify and turn on</button>
        <button type="button" className={btn} onClick={() => setEnrol(null)}>Cancel</button>
      </div>
    </> : <>
      <p className="ac-hint">Protect your account with a code from an authenticator app in addition to your password.</p>
      <button type="button" className={primary} style={{ width: "max-content" }} disabled={pending} onClick={begin}>{pending && <Loader2 size={14} className="mk-spin" />}Set up authenticator</button>
    </>}
    {codes && <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, background: "#f4f7fd" }} role="region" aria-label="Recovery codes">
      <b>Your recovery codes</b><small className="ac-hint">Each code works once if you lose your authenticator. They won’t be shown again.</small>
      <ol style={{ margin: 0, paddingLeft: 22, columns: 2, fontFamily: "ui-monospace, monospace" }}>{codes.map(c => <li key={c}>{c}</li>)}</ol>
      <div style={{ display: "flex", gap: 8 }}><button type="button" className={btn} onClick={download}><Download size={15} />Download</button><button type="button" className={btn} onClick={() => setCodes(null)}>I’ve saved them</button></div>
    </div>}
    {err && <p role="alert" style={{ margin: 0, color: "#c4142b" }}>{err}</p>}
    {msg && <p role="status" style={{ margin: 0, color: "#0f8a4e" }}>{msg}</p>}
  </section>;
}

/** Workspace owner control (spec §8). Members see the current rule. */
export function WorkspaceMfaPolicy({ workspaceId, policy, owner }: { workspaceId: string; policy: string; owner: boolean }) {
  const [value, setValue] = useState(policy), [err, setErr] = useState(""), [ok, setOk] = useState(""); const [pending, start] = useTransition();
  const OPTIONS: [string, string][] = [["optional", "Optional for everyone"], ["admins", "Required for owners and managers"], ["finance", "Required for owners, managers and finance"], ["all", "Required for all members"]];
  return <section className="ce-card ac-card" style={box} aria-labelledby="wsmfa-h">
    <h2 id="wsmfa-h">Workspace sign-in policy</h2>
    <p className="ac-hint">Members covered by the policy must set up two-step verification before they can open this workspace. They can always reach their own security settings, and recovery codes prevent lock-outs.</p>
    <select className="k-input" value={value} disabled={!owner || pending} onChange={e => { const v = e.target.value; setValue(v); setErr(""); setOk(""); start(async () => { const r = await setWorkspaceMfaPolicy(workspaceId, v as "optional"); if (r.ok) setOk("Policy saved."); else { setErr(r.error); setValue(policy); } }); }} aria-label="Two-step verification policy">
      {OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    {!owner && <p className="ac-hint">Only the workspace owner can change this.</p>}
    {err && <p role="alert" style={{ margin: 0, color: "#c4142b" }}>{err}</p>}{ok && <p role="status" style={{ margin: 0, color: "#0f8a4e" }}>{ok}</p>}
  </section>;
}
