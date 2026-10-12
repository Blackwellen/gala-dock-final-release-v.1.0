"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { MODULES } from "@/lib/maintenance-modules";
import { startMaintenance, endMaintenance } from "./actions";
import { promptDialog } from "@/lib/ui/dialogs";

const field: React.CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 600 };
const input: React.CSSProperties = { height: 34, border: "1px solid #dbe3f5", borderRadius: 7, padding: "0 8px", font: "inherit", fontWeight: 400 };

export function MaintenanceForm() {
  const [err, setErr] = useState(""), [ok, setOk] = useState(""), [stepUp, setStepUp] = useState(false), [code, setCode] = useState(""), [level, setLevel] = useState(1);
  const [pending, start] = useTransition();
  const submit = (f: FormData) => start(async () => {
    setErr(""); setOk("");
    if (stepUp) {
      const sb = createClient(); const { data } = await sb.auth.mfa.listFactors(); const fac = data?.totp?.find(x => x.status === "verified");
      if (!fac) { setErr("No authenticator app is set up on this account."); return; }
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fac.id, code: code.trim() });
      if (error) { setErr("That code didn’t work — try the latest one."); return; }
    }
    const r = await startMaintenance(f);
    if (r.ok) { setOk("Maintenance window saved. It can take up to 10 seconds to apply everywhere."); setStepUp(false); setCode(""); }
    else { setErr(r.error); if (r.stepUp) setStepUp(true); }
  });
  return <form action={submit} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
    <label style={field}>Level<select name="level" style={input} value={level} onChange={e => setLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>M{n}</option>)}</select></label>
    <label style={field}>Title<input name="title" required minLength={3} maxLength={120} style={input} /></label>
    <label style={{ ...field, gridColumn: "1/-1" }}>Message<textarea name="message" maxLength={1000} rows={2} style={{ ...input, height: "auto", padding: 8 }} /></label>
    <fieldset style={{ gridColumn: "1/-1", border: "1px solid #eef2fb", borderRadius: 8, padding: 10 }}><legend style={{ fontSize: 12, fontWeight: 600 }}>Affected modules (none = platform-wide; check-in is only affected when ticked)</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>{MODULES.map(m => <label key={m} style={{ display: "flex", gap: 4, fontSize: 12.5 }}><input type="checkbox" name="modules" value={m} />{m}</label>)}</div></fieldset>
    <label style={field}>Starts (blank = now)<input type="datetime-local" name="starts_at" style={input} /></label>
    <label style={field}>Ends (optional)<input type="datetime-local" name="ends_at" style={input} /></label>
    <label style={field}>Expected restoration<input type="datetime-local" name="expected_restore" style={input} /></label>
    <label style={field}>Status page URL<input type="url" name="status_url" placeholder="https://" style={input} /></label>
    <label style={field}>Audience<select name="audience" style={input}><option value="all">Everyone</option><option value="customers">Customers</option><option value="organizers">Organizers</option><option value="providers">Providers</option><option value="admins">Admins</option></select></label>
    <label style={field}>Banner severity<select name="severity" style={input}><option value="">Automatic</option><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
    <label style={field}>Reference<input name="reference" maxLength={60} placeholder="e.g. CHG-1042" style={input} /></label>
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" name="dismissible" defaultChecked />Banner can be dismissed (M1–M3)</label>
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" name="bypass" defaultChecked />Platform admins bypass the write freeze</label>
    {stepUp && <label style={field}>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} style={input} /></label>}
    <div style={{ gridColumn: "1/-1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button className="adb-btn primary" disabled={pending}>{pending ? "Saving…" : level >= 4 ? `Start M${level} (step-up required)` : "Save window"}</button>
      {err && <span role="alert" style={{ color: "#c4142b", fontSize: 12.5 }}>{err}</span>}{ok && <span role="status" style={{ color: "#0f8a4e", fontSize: 12.5 }}>{ok}</span>}
    </div>
  </form>;
}

export function EndWindow({ id }: { id: string }) {
  const [pending, start] = useTransition(); const [err, setErr] = useState("");
  return <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <button className="adb-btn" disabled={pending} onClick={async () => { const res = await promptDialog({ title: "End maintenance now", message: "Customers will see the service as available again straight away.", label: "Closing note — what was done and the outcome", multiline: true, maxLength: 1000, confirmLabel: "End maintenance" }); if (!res) return; start(async () => { const r = await endMaintenance(id, res.value); if (!r.ok) setErr(r.error); }); }}>{pending ? "Ending…" : "End now"}</button>
    {err && <span role="alert" style={{ color: "#c4142b", fontSize: 12.5 }}>{err}</span>}
  </div>;
}
