import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Db } from "@/lib/workspace/db";
import { untyped } from "@/lib/workspace/db";
import { upgradeHref } from "@/lib/settings/rules";
import { PLAN_NAME } from "@/lib/public/pricing";

export type LimitKey = "events" | "seats" | "listings";
export type PlanLimitStatus = { plan: string; kind: string; exempt: boolean; reporting_advanced: boolean } & Record<LimitKey, { used: number; max: number | null }>;
const LABEL: Record<LimitKey, string> = { events: "Active events", seats: "Team seats (owner, members, pending invitations)", listings: "Live listings" };
const NOUN: Record<LimitKey, string> = { events: "active events", seats: "team seats", listings: "live listings" };

/** plan_limit_status (migration 202611146901): the same counts the database enforces on new creation/publish. */
export async function planLimitStatus(db: Db, workspaceId: string): Promise<PlanLimitStatus | null> {
  const { data, error } = await untyped(db as never).rpc("plan_limit_status", { p_ws: workspaceId });
  return error || !data ? null : data as PlanLimitStatus;
}
export const atLimit = (s: PlanLimitStatus | null, k: LimitKey) => !!s && !s.exempt && s[k].max !== null && s[k].used >= s[k].max!;

/** Usage vs plan caps (billing tab). Enterprise / exempt workspaces read "Unlimited". */
export async function PlanLimits({ db, workspaceId, kind, className = "k-card st-c st-narrow" }: { db: Db; workspaceId: string; kind: "organizer" | "provider"; className?: string }) {
  const s = await planLimitStatus(db, workspaceId);
  if (!s) return null;
  const keys: LimitKey[] = kind === "provider" ? ["listings", "seats"] : ["events", "seats"];
  const full = keys.filter(k => atLimit(s, k));
  return <section className={className} aria-labelledby="plan-limits-h" style={{ display: "grid", gap: 10 }}>
    <h2 id="plan-limits-h">Plan limits</h2>
    <p className="k-small k-muted">{PLAN_NAME[s.plan] ?? s.plan} plan.{s.exempt ? " Demo and test workspaces aren't limited." : " Limits apply when you create or publish something new; nothing you already have is changed or removed."}</p>
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>{keys.map(k => { const { used, max } = s[k]; const unl = s.exempt || max === null; const pct = unl ? 0 : Math.min(100, (used / Math.max(1, max!)) * 100);
      return <li key={k} style={{ display: "grid", gap: 4 }}><span className="k-row" style={{ justifyContent: "space-between", gap: 12 }}><span className="k-small">{LABEL[k]}</span><b className={!unl && used >= max! ? "k-red" : ""}>{used.toLocaleString("en-GB")} / {unl ? "Unlimited" : max!.toLocaleString("en-GB")}</b></span>
        <span className="st-bar" aria-hidden style={{ display: "block", height: 5, borderRadius: 3, background: "#e6ecf5", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${pct}%`, background: !unl && used >= max! ? "var(--k-red, #e11d48)" : "var(--k-blue, #2563eb)" }} /></span></li>; })}
      {kind === "organizer" && <li className="k-row" style={{ justifyContent: "space-between" }}><span className="k-small">Advanced reporting</span><b>{s.reporting_advanced ? "Included" : "Not on this plan"}</b></li>}</ul>
    {full.length > 0 && <UpgradeNote kind={kind} text={`You've used all your ${full.map(k => NOUN[k]).join(" and ")}. Upgrade to add more.`} />}
  </section>;
}

export function UpgradeNote({ kind, text }: { kind: string; text: string }) {
  return <div className="k-notice amber" role="status" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
    <span>{text}</span><Link className="k-btn primary sm" href={upgradeHref(kind)}>Compare plans<ArrowUpRight size={13} aria-hidden /></Link></div>;
}

/** Inline prompt where new items are created (events list, team, invites): shown only when the cap is reached. */
export async function PlanLimitNotice({ db, workspaceId, kind, limit }: { db: Db; workspaceId: string; kind: "organizer" | "provider"; limit: LimitKey }) {
  const s = await planLimitStatus(db, workspaceId);
  if (!atLimit(s, limit)) return null;
  const { used, max } = s![limit];
  const plan = PLAN_NAME[s!.plan] ?? s!.plan;
  const text = limit === "events" ? `${plan} includes ${max} active events and you have ${used}. Drafts are fine — publishing or starting another event needs an upgrade (or archive one you've finished).`
    : limit === "seats" ? `${plan} includes ${max} team seats and ${used} are in use (including pending invitations). Revoke an invitation, remove a member, or upgrade to invite more.`
    : `${plan} includes ${max} live listings and you have ${used}. Pause one, or upgrade to publish more.`;
  return <UpgradeNote kind={kind} text={text} />;
}
