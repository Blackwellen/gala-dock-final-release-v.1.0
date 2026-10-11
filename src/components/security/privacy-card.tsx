"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { FileLock2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Req = { reference: string; kind: string; status: string; received_at: string; due_at: string; completed_at: string | null; refusal_reason: string | null };
const KINDS: [string, string][] = [["access", "A copy of my data (beyond the download)"], ["rectification", "Correct something about me"], ["restriction", "Restrict how my data is used"], ["objection", "Object to a use of my data"]];

/** Privacy rights (release spec §88–89): submit and follow data-subject requests; erasure uses the deletion card below. */
export function PrivacyCard() {
  const [sb] = useState(createClient);
  const [rows, setRows] = useState<Req[] | null>(null), [blockers, setBlockers] = useState<{ code: string; detail: string }[]>([]);
  const [kind, setKind] = useState("access"), [detail, setDetail] = useState(""), [msg, setMsg] = useState(""), [err, setErr] = useState(""); const [pending, start] = useTransition();
  const load = useCallback(async () => {
    const [{ data }, { data: b }] = await Promise.all([sb.from("privacy_requests" as never).select("reference,kind,status,received_at,due_at,completed_at,refusal_reason").order("received_at", { ascending: false }), sb.rpc("deletion_blockers" as never)]);
    setRows((data ?? []) as Req[]); setBlockers((b ?? []) as { code: string; detail: string }[]);
  }, [sb]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <section className="ce-card ac-card" id="privacy" style={{ display: "grid", gap: 10 }} aria-labelledby="priv-h">
    <h2 id="priv-h" style={{ display: "flex", gap: 8, alignItems: "center" }}><FileLock2 size={18} aria-hidden="true" />Your privacy rights</h2>
    <p className="ac-hint">You can ask for a copy of your data, a correction, a restriction or object to how we use it. We respond within one month. See our <Link href="/privacy">privacy notice</Link> and <Link href="/data-retention">retention schedule</Link>.</p>
    <div style={{ display: "grid", gap: 6 }}>
      <select className="k-input" value={kind} onChange={e => setKind(e.target.value)} aria-label="Request type">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <textarea className="k-input" rows={2} maxLength={4000} value={detail} onChange={e => setDetail(e.target.value)} placeholder="Tell us what you need (optional for a copy of your data)" aria-label="Request detail" style={{ height: "auto" }} />
      <button type="button" className="k-btn outline" style={{ width: "max-content" }} disabled={pending || ((kind === "rectification" || kind === "objection") && detail.trim().length < 5)}
        onClick={() => start(async () => { setMsg(""); setErr(""); const { data, error } = await sb.rpc("submit_privacy_request" as never, { p_kind: kind, p_detail: detail } as never);
          if (error) setErr(/already_open/.test(error.message) ? "You already have an open request of this type." : "Couldn’t submit the request."); else { setMsg(`Request ${data} submitted.`); setDetail(""); await load(); } })}>Submit request</button>
    </div>
    {rows && rows.length > 0 && <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>{rows.map(r => <li key={r.reference} style={{ padding: "8px 10px", border: "1px solid #eef2fb", borderRadius: 8 }}>
      <b>{r.reference}</b> · {r.kind} · <span>{r.status.replace(/_/g, " ")}</span><br />
      <small className="ac-hint">Received {new Date(r.received_at).toLocaleDateString("en-GB")} · {r.completed_at ? `closed ${new Date(r.completed_at).toLocaleDateString("en-GB")}` : `due by ${new Date(r.due_at).toLocaleDateString("en-GB")}`}{r.refusal_reason ? ` · ${r.refusal_reason}` : ""}</small></li>)}</ul>}
    {blockers.length > 0 && <div role="note" style={{ padding: "8px 10px", borderRadius: 8, background: "#fff2df", color: "#7a4100" }}><b>Before your account can be deleted:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{blockers.map(b => <li key={b.code}>{b.detail}</li>)}</ul></div>}
    {msg && <p role="status" className="ac-hint">{msg}</p>}{err && <p role="alert" style={{ margin: 0, color: "#c4142b" }}>{err}</p>}
  </section>;
}
