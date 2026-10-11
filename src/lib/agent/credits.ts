"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type R = { ok: true } | { ok: false; error: string };

/** Workspace AI budget (release spec §20). Owners/managers; enabling overage is owner-only (enforced in set_ai_budget). */
export async function saveAiBudget(workspaceId: string, f: FormData): Promise<R> {
  const caps = String(f.get("soft_caps") ?? "70,85,95").split(",").map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n > 0 && n < 100).slice(0, 5);
  const num = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : Math.max(0, Number(v)); };
  const sb = await createClient();
  const { error } = await sb.rpc("set_ai_budget" as never, { p_workspace: workspaceId, p: {
    soft_caps: caps.length ? caps : [70, 85, 95], hard_cap: f.get("hard_cap") === "on", allow_overage: f.get("allow_overage") === "on", overage_limit: num("overage_limit") ?? 0,
    daily_limit: num("daily_limit"), per_run_limit: num("per_run_limit") ?? 50, deep_allowed: f.get("deep_allowed") === "on",
  } } as never);
  if (error) return { ok: false, error: /owner_only/.test(error.message) ? "Only the workspace owner can approve overage." : /not_authorized/.test(error.message) ? "Only owners and managers can change the Agent budget." : "Couldn’t save the budget." };
  revalidatePath("/organizer/settings", "page"); revalidatePath("/provider/settings", "page");
  return { ok: true };
}
