"use client";
import { useState } from "react";
import { acceptProposal } from "./actions";

export function AcceptForm({ token, version }: { token: string; version: number }) {
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  if (state.done) return <div className="k-notice green"><b>{state.done === "expired" ? "This proposal has expired." : "Thank you — your acceptance has been recorded."}</b></div>;
  return <form className="k-col" style={{ gap: 10 }} onSubmit={async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (!f.get("agree")) { setState({ error: "Please confirm you agree to the terms." }); return; }
    setState({ busy: true });
    const r = await acceptProposal(token, String(f.get("name")), String(f.get("email")), version);
    setState(r.ok ? { done: r.result } : { error: r.error });
  }}>
    <label className="k-field"><span>Full name</span><input className="k-input" name="name" required minLength={2} autoComplete="name" /></label>
    <label className="k-field"><span>Email</span><input className="k-input" name="email" type="email" required autoComplete="email" /></label>
    <label className="k-check"><input type="checkbox" name="agree" /><span>I accept this proposal (version {version}) and its terms on behalf of the client.</span></label>
    {state.error && <div className="k-notice red" role="alert">{state.error}</div>}
    <button className="k-btn primary lg" disabled={state.busy}>{state.busy ? "Recording…" : "Accept proposal"}</button>
  </form>;
}
