import "server-only";
import { rows, type Db } from "@/lib/workspace/db";

export type Ref = { label: string; ref?: string; image?: string; icon?: string };
export type Case = {
  id: string; reference: string; subject: string; category: string; priority: string; status: string; requester_id: string | null; requester_name: string; workspace_id: string | null;
  assignee_id: string | null; assignee_name: string; sla_due_at: string | null; amount: number | null; outcome: string | null; resolution_reason: string | null; created_at: string; resolved_at: string | null;
  related: {
    type_label?: string; subject_ref?: Ref; requester?: { name: string; email?: string; avatar?: string }; source?: string; created_by?: string; updated_at?: string; summary?: string; subcategory?: string;
    event?: { name: string; ref: string; image: string; starts?: string; ends?: string; location?: string }; order?: { ref: string; label: string; transaction_id?: string };
    provider?: { name: string; ref: string }; venue?: { name: string; ref: string; image?: string }; transaction_id?: string; related_cases?: string[];
    proposed?: { action: string; amount: number; amount_label?: string; reason: string; policy: string; approval: string; eligible?: string };
  };
};
export type Msg = { id: number; case_id: string; author: string; author_id: string | null; body: string; internal: boolean; role: string; created_at: string };

export const CASE_COLS = "id,reference,subject,category,priority,status,requester_id,requester_name,workspace_id,assignee_id,assignee_name,sla_due_at,amount,outcome,resolution_reason,created_at,resolved_at,related";
export const loadCases = (db: Db) => rows<Case>(db.from("support_cases").select(CASE_COLS).order("created_at", { ascending: false }).limit(3000));

export const updatedAt = (c: Case) => c.related?.updated_at ?? c.resolved_at ?? c.created_at;
export const typeLabel = (c: Case) => c.related?.type_label || ({ no_show: "Provider", emergency: "Provider", refund: "Payment" } as Record<string, string>)[c.category] || c.category.replace(/_/g, " ").replace(/^\w/, m => m.toUpperCase());
export const TYPE_TONE: Record<string, string> = { Booking: "blue", Ticketing: "purple", Provider: "amber", Payment: "green", Event: "blue", Marketplace: "pink", Account: "grey" };

/** SLA target (hours from creation) and remaining time against the stored deadline. */
export function sla(c: Case, now: number) {
  if (!c.sla_due_at) return { target: "—", left: "", overdue: false, risk: false };
  const due = new Date(c.sla_due_at).getTime(), created = new Date(c.created_at).getTime();
  const targetH = Math.max(1, Math.round((due - created) / 36e5));
  const end = c.resolved_at ? new Date(c.resolved_at).getTime() : now;
  const ms = due - end, mins = Math.round(Math.abs(ms) / 60000), h = Math.floor(mins / 60), m = mins % 60;
  const span = h ? (m && h < 10 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return { target: `${targetH}h`, left: ms < 0 ? "overdue" : `${span} left`, overdue: ms < 0, risk: !c.resolved_at && ms >= 0 && ms < 2 * 36e5, elapsed: Math.round((end - created) / 60000), remainingMin: Math.round(ms / 60000), targetH };
}

/** Message role: explicit role column, else inferred from the author. */
export function roleOf(m: Msg, c: Case) {
  if (m.role) return m.role;
  if (m.author === "System") return "system";
  if (m.author_id && m.author_id === c.requester_id) return "customer";
  return m.internal ? "support" : m.author_id ? "support" : "customer";
}
