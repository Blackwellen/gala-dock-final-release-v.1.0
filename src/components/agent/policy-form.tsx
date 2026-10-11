"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { savePolicy } from "@/lib/agent/actions";

type ToolRow = { id: string; title: string; risk: number; description: string };
type PolicyRow = { mode: string; allowed_tools: string[] | null; auto_tools: string[]; quiet_hours: { from: string; to: string } | null; approval_expiry_hours: number; max_parallel_runs: number;
  max_run_minutes: number; min_confidence: number; daily_spend_cap_minor: number; monthly_spend_cap_minor: number; refund_threshold_minor: number; booking_authority_minor: number;
  autopilot_rules: { tool: string; max_amount_minor?: number }[] };
const MODES: [string, string, string][] = [
  ["always_ask", "Always ask", "Every change, even a draft or internal task, waits for your approval."],
  ["suggest", "Suggest", "Analyses and recommends only."],
  ["draft", "Draft", "Creates drafts; nothing external or binding."],
  ["execute_with_approval", "Execute with approval", "Low-risk internal actions run automatically; anything external or binding waits for a person. Recommended."],
  ["operational", "Operational auto", "Low-risk actions plus the external actions you tick below run automatically; commitments still wait for a person."],
  ["policy_autopilot", "Policy autopilot", "Only the pre-authorised actions and limits below run automatically — never unrestricted."],
];
const RISK = ["R0 Read", "R1 Draft", "R2 Internal", "R3 External", "R4 Commitment", "R5 Security"];

/** Organizer/Provider → Agent policy (§10–11). Role permissions still win: the Agent can never do what the requester can't. */
export function PolicyForm({ workspaceId, tools, policy, canEdit }: { workspaceId: string; tools: ToolRow[]; policy: PolicyRow | null; canEdit: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const p: PolicyRow = policy ?? { mode: "execute_with_approval", allowed_tools: null, auto_tools: [], quiet_hours: { from: "21:00", to: "08:00" }, approval_expiry_hours: 72, max_parallel_runs: 3,
    max_run_minutes: 240, min_confidence: 0.6, daily_spend_cap_minor: 0, monthly_spend_cap_minor: 0, refund_threshold_minor: 0, booking_authority_minor: 0, autopilot_rules: [] };
  const [mode, setMode] = useState(p.mode);
  const [restrict, setRestrict] = useState(p.allowed_tools !== null);
  const pounds = (m: number) => (m / 100).toString();
  return <form className="mk-form ap-form" aria-label="Agent policy" action={f => start(async () => {
    const n = (k: string) => Number(f.get(k) ?? 0), mm = (k: string) => Math.round(n(k) * 100);
    const r = await savePolicy(workspaceId, { mode, allowedTools: restrict ? f.getAll("allowed").map(String) : null, autoTools: f.getAll("auto").map(String),
      quietFrom: String(f.get("quiet_from") ?? ""), quietTo: String(f.get("quiet_to") ?? ""), approvalExpiryHours: n("expiry"), maxParallel: n("parallel"), maxRunMinutes: n("minutes"),
      minConfidence: n("confidence") / 100, dailySpendCapMinor: mm("daily"), monthlySpendCapMinor: mm("monthly"), refundThresholdMinor: mm("refund"), bookingAuthorityMinor: mm("booking"),
      autopilotRules: tools.filter(t => t.risk >= 3 && t.risk <= 4 && f.get(`ap_${t.id}`) === "on").map(t => ({ tool: t.id, ...(f.get(`apmax_${t.id}`) ? { max_amount_minor: Math.round(Number(f.get(`apmax_${t.id}`)) * 100) } : {}) })) });
    setMsg(r.ok ? { ok: true, t: "Policy saved." } : { ok: false, t: r.error }); if (r.ok) router.refresh();
  })}>
    <fieldset disabled={!canEdit} style={{ display: "contents" }}>
      <fieldset className="mk-field wide mk-seg" style={{ border: 0, padding: 0 }}><legend>Mode</legend>
        {MODES.map(([k, l, d]) => <label key={k} title={d}><input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} />{l}</label>)}</fieldset>
      <p className="mk-note wide">{MODES.find(m => m[0] === mode)?.[2]} Security, legal and ownership actions (R5) are never executed by the Agent.</p>
      <label className="mk-switch wide"><input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} />Only allow selected tools</label>
      <div className="wide ap-tools">{tools.map(t => <div key={t.id} className="ap-tool">
        <div><b>{t.title}</b><small>{RISK[t.risk]} · {t.description}</small></div>
        <span className="mk-row">
          {restrict && <label className="mk-switch"><input type="checkbox" name="allowed" value={t.id} defaultChecked={p.allowed_tools?.includes(t.id) ?? true} />Allowed</label>}
          {t.risk === 3 && (mode === "operational" || mode === "policy_autopilot") && <label className="mk-switch"><input type="checkbox" name="auto" value={t.id} defaultChecked={p.auto_tools.includes(t.id)} />Run without approval</label>}
          {mode === "policy_autopilot" && t.risk >= 3 && t.risk <= 4 && <><label className="mk-switch"><input type="checkbox" name={`ap_${t.id}`} defaultChecked={p.autopilot_rules.some(r => r.tool === t.id)} />Autopilot</label>
            <label className="mk-field" style={{ width: 120 }}><span>Up to £</span><input name={`apmax_${t.id}`} type="number" min={0} step="1" defaultValue={p.autopilot_rules.find(r => r.tool === t.id)?.max_amount_minor != null ? pounds(p.autopilot_rules.find(r => r.tool === t.id)!.max_amount_minor!) : ""} /></label></>}
        </span></div>)}</div>
      <label className="mk-field"><span>Quiet hours from</span><input name="quiet_from" type="time" defaultValue={p.quiet_hours?.from ?? "21:00"} /></label>
      <label className="mk-field"><span>Quiet hours until</span><input name="quiet_to" type="time" defaultValue={p.quiet_hours?.to ?? "08:00"} /></label>
      <label className="mk-field"><span>Approvals expire after (hours)</span><input name="expiry" type="number" min={1} max={720} defaultValue={p.approval_expiry_hours} /></label>
      <label className="mk-field"><span>Max parallel runs</span><input name="parallel" type="number" min={1} max={20} defaultValue={p.max_parallel_runs} /></label>
      <label className="mk-field"><span>Max run duration (minutes)</span><input name="minutes" type="number" min={5} max={10080} defaultValue={p.max_run_minutes} /></label>
      <label className="mk-field"><span>Minimum confidence to act (%)</span><input name="confidence" type="number" min={0} max={100} defaultValue={Math.round(p.min_confidence * 100)} /></label>
      <label className="mk-field"><span>Booking authority (£)</span><input name="booking" type="number" min={0} defaultValue={pounds(p.booking_authority_minor)} /></label>
      <label className="mk-field"><span>Refund threshold (£)</span><input name="refund" type="number" min={0} defaultValue={pounds(p.refund_threshold_minor)} /></label>
      <label className="mk-field"><span>Daily spend cap (£)</span><input name="daily" type="number" min={0} defaultValue={pounds(p.daily_spend_cap_minor)} /></label>
      <label className="mk-field"><span>Monthly spend cap (£)</span><input name="monthly" type="number" min={0} defaultValue={pounds(p.monthly_spend_cap_minor)} /></label>
      <div className="mk-row wide"><button className="mk-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Save policy</button>
        {!canEdit && <span className="mk-note">Only the workspace owner can change Agent policy.</span>}{msg && <span role="status" className={msg.ok ? "mk-note" : "mk-error"}>{msg.t}</span>}</div>
    </fieldset>
  </form>;
}
