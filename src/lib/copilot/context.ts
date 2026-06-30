// Gala Dock — Copilot context builder (V1-2 Phase 3). Resolves a compact, token-budgeted
// snapshot of the workspace (upcoming events, overdue work, supplier/finance counts) and injects
// it as grounding so chat answers are about the user's REAL data — not generic. Workspace-scoped
// + RLS. Kept small on purpose; the full graph traversal lands in a later phase.

import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

const DONE = new Set(["done", "completed", "cancelled", "archived"]);

export async function buildWorkspaceContext(workspaceId: string): Promise<string> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [eventsRes, overdueRes, supplierRes, invoiceRes] = await Promise.all([
    supabase
      .from("events")
      .select("name, start_at, status, venue_name_snapshot")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(5),
    supabase
      .from("tasks")
      .select("id, status, due_at")
      .eq("workspace_id", workspaceId)
      .lt("due_at", nowIso)
      .limit(100),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("invoices")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .limit(200),
  ]);

  const upcoming = (eventsRes.data ?? [])
    .map((e) => {
      const date = e.start_at ? ` (${formatDate(e.start_at)})` : "";
      const venue = e.venue_name_snapshot ? ` @ ${e.venue_name_snapshot}` : "";
      return `${e.name}${date}${venue} [${e.status}]`;
    })
    .join("; ");

  const overdueOpen = (overdueRes.data ?? []).filter((t) => !DONE.has(String(t.status))).length;
  const unpaid = (invoiceRes.data ?? []).filter((i) =>
    ["sent", "overdue", "partial", "unpaid", "draft"].includes(String(i.status))
  ).length;

  const parts: string[] = [];
  if (upcoming) parts.push(`Upcoming events: ${upcoming}.`);
  parts.push(`Overdue tasks: ${overdueOpen}.`);
  if (typeof supplierRes.count === "number") parts.push(`Suppliers on file: ${supplierRes.count}.`);
  parts.push(`Open invoices: ${unpaid}.`);

  return parts.join(" ");
}
