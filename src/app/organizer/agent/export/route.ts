import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { agentActivityCsv, csvResponse, exportDays } from "@/lib/agent/export";

/** Q53: Gala Agent activity export (runs + governed tool calls, no arguments) for owners and managers of this workspace. */
export async function GET(request: Request) {
  const ctx = await getOrganizer();
  if (!["owner", "manager"].includes(ctx.role)) return new Response("Only owners and managers can export Gala Agent activity.", { status: 403 });
  return csvResponse(await agentActivityCsv(untyped(ctx.supabase), ctx.workspace.id, exportDays(request.url)), "gala-agent-activity.csv");
}
