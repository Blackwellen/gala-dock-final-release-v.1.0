import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceAccess } from "@/lib/auth";
import type { Article } from "@/lib/help/articles";

export type HelpFrom = "customer" | "organizer" | "provider";
export const helpFrom = (v: unknown): HelpFrom | null => v === "customer" || v === "organizer" || v === "provider" ? v : null;

/** One Help Centre for everyone (owner 2026-10-29). Signed-in visitors get their own guides first and a contact form tied to the
 *  workspace they came from (`?from=`), else the last one they opened. Never redirects; contact_support only attaches a workspace
 *  the caller is a member of. */
export async function helpContext(from: HelpFrom | null): Promise<{ first?: Article["audience"]; workspaceId: string | null; source: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { workspaceId: null, source: "Help Centre" };
  const [access, { data: profile }] = await Promise.all([
    listWorkspaceAccess(supabase),
    supabase.from("profiles").select("last_workspace_id").eq("id", user.id).maybeSingle(),
  ]);
  const usable = access.filter(w => w.member_status === "active" && w.workspace_status === "active");
  const last = usable.find(w => w.id === profile?.last_workspace_id);
  const kind = from ?? last?.kind ?? "customer";
  if (kind === "customer") return { first: "Customers", workspaceId: null, source: "Customer account" };
  const ws = (last?.kind === kind ? last : undefined) ?? usable.find(w => w.kind === kind);
  return kind === "organizer"
    ? { first: "Organizers", workspaceId: ws?.id ?? null, source: "Organizer workspace" }
    : { first: "Providers", workspaceId: ws?.id ?? null, source: "Provider workspace" };
}
