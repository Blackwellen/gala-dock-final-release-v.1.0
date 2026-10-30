"use client";
import { useState } from "react";
import { signContractByToken } from "@/lib/actions/contracts";

export function SignContractForm({ token, version }: { token: string; version: number }) {
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string; declining?: boolean }>({});
  if (state.done) return <div className={`k-notice ${state.done === "declined" ? "amber" : "green"}`}><b>{state.done === "declined" ? "You declined this contract. The sender has been told." : state.done === "expired" ? "The signing window has passed." : "Thank you — your signature has been recorded."}</b></div>;
  const submit = async (f: FormData, accept: boolean) => {
    if (accept && !f.get("agree")) { setState({ error: "Please confirm you agree to sign." }); return; }
    setState({ busy: true });
    const r = await signContractByToken(token, String(f.get("name")), String(f.get("email")), version, accept, String(f.get("reason") ?? ""));
    setState(r.ok ? { done: r.data?.result } : { error: r.error });
  };
  return <form className="k-col" style={{ gap: 10 }} onSubmit={async e => { e.preventDefault(); await submit(new FormData(e.currentTarget), !state.declining); }}>
    <label className="k-field"><span>Full name (your typed signature)</span><input className="k-input" name="name" required minLength={2} autoComplete="name" /></label>
    <label className="k-field"><span>Email (must match the invited signer)</span><input className="k-input" name="email" type="email" required autoComplete="email" /></label>
    {state.declining ? <label className="k-field"><span>Reason (optional)</span><textarea className="k-textarea" name="reason" maxLength={500} /></label>
      : <label className="k-check"><input type="checkbox" name="agree" /><span>I have read version {version} and sign it electronically. My name, email, the version fingerprint and the time are recorded.</span></label>}
    {state.error && <div className="k-notice red" role="alert">{state.error}</div>}
    <div className="k-row" style={{ gap: 8 }}>
      <button className={`k-btn ${state.declining ? "danger" : "primary"} lg`} disabled={state.busy}>{state.busy ? "Recording…" : state.declining ? "Decline contract" : "Sign contract"}</button>
      <button type="button" className="k-btn ghost lg" onClick={() => setState({ declining: !state.declining })}>{state.declining ? "Back to signing" : "Decline"}</button>
    </div>
  </form>;
}
