"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmDialog } from "@/lib/ui/dialogs";

type P = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

/** Passkeys (release spec §7): sign in with Face ID, Touch ID, Windows Hello or a security key — no password needed. */
export function PasskeysCard() {
  const [sb] = useState(createClient);
  const [rows, setRows] = useState<P[] | null>(null), [msg, setMsg] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  const supported = typeof window !== "undefined" && "PublicKeyCredential" in window;
  const load = useCallback(async () => { const { data } = await sb.auth.passkey.list(); setRows((data ?? []) as P[]); }, [sb]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <section className="ce-card ac-card" id="passkeys" style={{ display: "grid", gap: 10 }} aria-labelledby="pk-h">
    <h2 id="pk-h" style={{ display: "flex", gap: 8, alignItems: "center" }}><Fingerprint size={18} aria-hidden="true" />Passkeys</h2>
    <p className="ac-hint">Sign in with your fingerprint, face or device PIN instead of a password. Passkeys can’t be phished and work across your devices.</p>
    {!supported && <p className="ac-hint">This browser doesn’t support passkeys.</p>}
    {rows && rows.length > 0 && <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>{rows.map(p => <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #eef2fb", borderRadius: 8 }}>
      <span style={{ flex: 1 }}><b>{p.friendly_name || "Passkey"}</b><br /><small className="ac-hint">Added {new Date(p.created_at).toLocaleDateString("en-GB")}{p.last_used_at ? ` · last used ${new Date(p.last_used_at).toLocaleDateString("en-GB")}` : ""}</small></span>
      <button type="button" className="k-btn outline sm" aria-label={`Remove ${p.friendly_name || "passkey"}`} disabled={pending} onClick={async () => { if ((await confirmDialog({ title: "Remove this passkey? You won’t be able to sign in with it any more.", confirmLabel: "Remove", danger: true }))) start(async () => {
        const { error } = await sb.auth.passkey.delete({ passkeyId: p.id }); if (error) setErr("Couldn’t remove the passkey."); else { setMsg("Passkey removed."); await load(); } }); }}><Trash2 size={14} /></button>
    </li>)}</ul>}
    {supported && <button type="button" className="k-btn" style={{ width: "max-content" }} disabled={pending} onClick={() => start(async () => {
      setMsg(""); setErr("");
      const { error } = await sb.auth.registerPasskey();
      if (error) setErr(/abort|cancel|NotAllowed/i.test(error.message) ? "Passkey set-up was cancelled." : "Couldn’t add a passkey. Make sure you’re on www.galadock.com and try again.");
      else { setMsg("Passkey added. Next time, choose “Sign in with a passkey”."); await load(); }
    })}>{pending ? "Waiting for your device…" : "Add a passkey"}</button>}
    {msg && <p role="status" className="ac-hint">{msg}</p>}{err && <p role="alert" style={{ margin: 0, color: "#c4142b" }}>{err}</p>}
  </section>;
}
