import Link from "next/link";
import { AlertTriangle, CheckCircle2, Lock, ShieldAlert, type LucideIcon } from "lucide-react";
import { Card, Chip } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

/** Shared server pieces for the lane D S3 event sections (partners, logistics, compliance, accessibility, weather). */
export const MANAGE_ROLES = ["owner", "admin", "manager"];
export const canManage = (role: string) => MANAGE_ROLES.includes(role);
export const VIEW_ONLY = "Only the event's owners and managers can change this.";

export type OpsItem = { domain: string; key: string; severity: "blocker" | "warning"; message: string; fix: string; ref_id: string | null; conflict: boolean };

/** Readiness checks for one domain from event_ops_readiness (the same source as feasibility, readiness and the lifecycle gate). */
export async function opsItems(eventId: string, filter: (i: OpsItem) => boolean): Promise<{ items: OpsItem[]; error: boolean }> {
  const sb = untyped(await createClient());
  const { data, error } = await sb.rpc("event_ops_readiness", { p_event: eventId });
  if (error) return { items: [], error: true };
  return { items: ((data as { items?: OpsItem[] })?.items ?? []).filter(filter), error: false };
}

export function ViewOnly({ role, what }: { role: string; what: string }) {
  if (canManage(role)) return null;
  return <div className="k-notice eo-viewonly" role="note"><Lock size={15} /><span><b>View only.</b> Your role ({role || "member"}) can see {what}; only the event&apos;s owners and managers can change it.</span></div>;
}

export function ChecksCard({ title, items, error, empty, max = 8 }: { title: string; items: OpsItem[]; error?: boolean; empty: string; max?: number }) {
  const blockers = items.filter(i => i.severity === "blocker").length;
  return <Card className="eo-checks">
    <div className="k-between"><h3 className="ov-h">{title}</h3>{items.length ? <Chip tone={blockers ? "red" : "amber"}>{blockers ? `${blockers} blocker${blockers > 1 ? "s" : ""}` : `${items.length} warning${items.length > 1 ? "s" : ""}`}</Chip> : !error && <Chip tone="green">Ready</Chip>}</div>
    {error ? <p className="k-small eo-muted">Readiness checks couldn&apos;t load. Refresh to try again.</p>
      : items.length ? <ul className="eo-check-list">{items.slice(0, max).map((i, n) => <li key={`${i.key}-${i.ref_id ?? n}`}>
        {i.severity === "blocker" ? <ShieldAlert size={16} className="k-red" aria-label="Blocker" /> : <AlertTriangle size={16} className="k-amber" aria-label="Warning" />}
        <span className="k-grow">{i.message}</span>{i.fix && <Link className="k-link" href={i.fix}>Fix</Link>}</li>)}
        {items.length > max && <li className="eo-muted">{items.length - max} more — resolve the ones above first.</li>}</ul>
      : <p className="k-small eo-ok"><CheckCircle2 size={15} className="k-green" />{empty}</p>}
  </Card>;
}

export function Stat({ icon: Icon, label, value, sub, tone = "blue" }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "blue" | "green" | "amber" | "red" | "purple" }) {
  return <div className="k-kpi eo-stat"><span className={`k-tile lg ${tone}`}><Icon size={19} /></span><div className="k-grow"><div className="lbl">{label}</div><div className="val">{value}</div>{sub != null && <div className="sub">{sub}</div>}</div></div>;
}

export const STATUS_TONE: Record<string, "green" | "amber" | "red" | "blue" | "gray" | "purple"> = {
  confirmed: "green", completed: "green", approved: "green", accepted: "green", granted: "green", issued: "green", allocated: "green", met: "green", ok: "green", active: "green", fulfilled: "green", done: "green",
  prospect: "gray", draft: "gray", pending: "amber", planned: "blue", requested: "amber", reserved: "amber", negotiating: "blue", in_progress: "blue", submitted: "blue", tentative: "amber", held: "amber", provisional: "amber", partially_issued: "amber",
  changes_requested: "amber", waived: "purple", not_required: "purple", superseded: "gray", available: "blue", en_route: "blue",
  rejected: "red", refused: "red", cancelled: "gray", withdrawn: "gray", revoked: "red", expired: "red", missing: "red", blocked: "red", retired: "gray", released: "gray", ended: "gray", not_configured: "amber", error: "red",
};
export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
export function StatusChip({ s }: { s: string }) { return <Chip tone={STATUS_TONE[s] ?? "gray"}>{label(s)}</Chip>; }
