import "server-only";
import { rows, count } from "@/lib/workspace/db";
import type { AdminContext } from "./context";

/** Alert and support counts for the Admin top bar. Each widget only reads what the admin is permitted to see (RLS). */
export async function adminShellData(ctx: AdminContext) {
  const { db, permissions } = ctx;
  const trust = permissions.has("trust"), support = permissions.has("support");
  const [alertsCount, alerts, supportCount, cases] = await Promise.all([
    trust ? count(db.from("trust_cases").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]).gte("risk_score", 70)) : 0,
    trust ? rows<{ id: string; reference: string; subject_name: string; reason: string; risk_score: number }>(
      db.from("trust_cases").select("id,reference,subject_name,reason,risk_score").in("status", ["open", "in_review"]).order("risk_score", { ascending: false }).limit(5)) : [],
    support ? count(db.from("support_cases").select("id", { count: "exact", head: true }).in("status", ["open", "escalated"])) : 0,
    support ? rows<{ id: string; reference: string; subject: string; requester_name: string; priority: string }>(
      db.from("support_cases").select("id,reference,subject,requester_name,priority").in("status", ["open", "escalated"]).order("created_at", { ascending: false }).limit(5)) : [],
  ]);
  return {
    counts: { alerts: alertsCount, support: supportCount },
    alerts: alerts.map(a => ({ id: a.id, title: `${a.subject_name} · risk ${a.risk_score}`, body: a.reason, href: `/admin/trust/${a.id}`, unread: true })),
    support: cases.map(c => ({ id: c.id, title: `#${c.reference} ${c.subject}`, body: `${c.requester_name} · ${c.priority} priority`, href: `/admin/support/${c.id}`, unread: true })),
  };
}
