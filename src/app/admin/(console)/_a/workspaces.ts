import "server-only";
import { rows, type Db } from "@/lib/workspace/db";
import { rpc } from "./lib";

export type Ws = { id: string; name: string; kind: "organizer" | "provider"; plan: string; status: string; verification_status: string; payout_status: string; commission_bps: number;
  cover_image: string; created_at: string; owner_id: string; capabilities: string[]; settings: { reference?: string; company?: string; company_no?: string; vat_number?: string; location?: string } | null };
export type WsMetric = { workspace_id: string; gmv: number; gmv_prev: number; tickets: number; tickets_prev: number; events: number; upcoming_events: number; services_booked: number;
  services_prev: number; members: number; last_activity: string | null; open_flags: number; max_risk: number | null; open_cases: number; fees: number };
export type Owner = { id: string; full_name: string; avatar_url: string };

export const WS_COLS = "id,name,kind,plan,status,verification_status,payout_status,commission_bps,cover_image,created_at,owner_id,capabilities,settings";

/** Health is derived from live signals only: suspension, verification state and open trust cases. */
export function health(w: Pick<Ws, "status" | "verification_status">, m?: Pick<WsMetric, "open_flags" | "max_risk">) {
  if (w.status === "suspended") return { key: "suspended", label: "Suspended" };
  if ((m?.max_risk ?? 0) >= 70 || ["unverified", "rejected"].includes(w.verification_status)) return { key: "at_risk", label: "At risk" };
  if (w.verification_status === "pending" || (m?.open_flags ?? 0) > 0) return { key: "review", label: "Review" };
  return { key: "healthy", label: "Healthy" };
}
export type Plans = Record<string, { monthly: number; commission_bps: number }>;
/** Published plan catalogue (platform_settings › commerce). */
export async function loadPlans(db: Db) {
  const c = await rpc<{ plans?: Plans; payout_schedule?: string } | null>(db, "plan_catalog").catch(() => null);
  return { plans: c?.plans ?? {}, payoutSchedule: c?.payout_schedule ?? "weekly" };
}
/** "10% (Plan rate)" when the workspace pays its plan's published rate, otherwise "(Custom)". */
export const commissionTier = (bps: number, plan: string, plans: Plans) => `${bps / 100}% (${plans[plan]?.commission_bps === bps ? "Plan rate" : "Custom"})`;

export async function loadMetrics(db: Db, days = 30) {
  const list = await rpc<WsMetric[]>(db, "admin_workspace_metrics", { p_days: days });
  return new Map(list.map(m => [m.workspace_id, { ...m, gmv: Number(m.gmv), gmv_prev: Number(m.gmv_prev), fees: Number(m.fees) }]));
}
export async function loadOwners(db: Db, ids: string[], allowed: boolean) {
  if (!allowed || !ids.length) return new Map<string, Owner>();
  const list = await rows<Owner>(db.from("profiles").select("id,full_name,avatar_url").in("id", [...new Set(ids)]));
  return new Map(list.map(o => [o.id, o]));
}
