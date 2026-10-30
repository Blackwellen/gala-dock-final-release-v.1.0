"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";
import { MODULES } from "@/lib/maintenance-modules";

type R = { ok: true } | { ok: false; error: string; stepUp?: boolean };

/** Starts a maintenance window (release spec §10). M4/M5 require step-up MFA within 10 minutes — enforced in start_maintenance(). */
export async function startMaintenance(f: FormData): Promise<R> {
  const admin = await getAdmin();
  if (!admin.permissions.has("settings" as never)) return { ok: false, error: "You don’t have permission to change maintenance." };
  const level = Number(f.get("level"));
  const modules = f.getAll("modules").map(String).filter(m => (MODULES as readonly string[]).includes(m));
  const iso = (k: string) => { const v = String(f.get(k) ?? ""); if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
  const title = String(f.get("title") ?? "").trim();
  const reason = String(f.get("reason") ?? "").trim();
  if (!(level >= 1 && level <= 5) || title.length < 3) return { ok: false, error: "Choose a level and give the notice a title." };
  if (reason.length < 5) return { ok: false, error: "Give a reason for this change (at least 5 characters). It is recorded in the audit log." };
  const { error } = await admin.db.rpc("start_maintenance" as never, { p: {
    level, modules, title, reason: reason.slice(0, 500), message: String(f.get("message") ?? "").slice(0, 1000), starts_at: iso("starts_at"), ends_at: iso("ends_at"), expected_restore: iso("expected_restore"),
    status_url: String(f.get("status_url") ?? "").trim(), audience: String(f.get("audience") ?? "all"), dismissible: f.get("dismissible") === "on",
    severity: String(f.get("severity") ?? "") || null, reference: String(f.get("reference") ?? "").slice(0, 60), bypass_roles: f.get("bypass") === "on" ? ["platform_admin"] : [],
  } } as never);
  if (error) return /step_up/.test(error.message) ? { ok: false, error: level >= 4 ? "Verify with your authenticator to start M4 or M5." : "Verify with your authenticator, then save again.", stepUp: true }
    : /reason_required/.test(error.message) ? { ok: false, error: "Give a reason for this change (at least 5 characters)." }
    : { ok: false, error: /check constraint|invalid input/.test(error.message) ? "Some fields are invalid — the status link must start with https:// and the end must be after the start." : "Couldn’t start maintenance." };
  revalidatePath("/admin/maintenance"); return { ok: true };
}

export async function endMaintenance(id: string, note: string): Promise<R> {
  const admin = await getAdmin();
  if (note.trim().length < 5) return { ok: false, error: "Add a closing note (at least 5 characters)." };
  const { error } = await admin.db.rpc("end_maintenance" as never, { p_window: id, p_note: note } as never);
  if (error) return { ok: false, error: /step_up/.test(error.message) ? "Verify with your authenticator, then try again." : "Couldn’t end this window." };
  revalidatePath("/admin/maintenance"); return { ok: true };
}
