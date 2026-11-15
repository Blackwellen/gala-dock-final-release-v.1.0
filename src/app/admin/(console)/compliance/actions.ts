"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";

type R = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Q74 (D4): grant or revoke a sanctions override for a workspace or user. Trust permission, aal2, reason required, audited in the DB. */
export async function setSanctionsOverride(f: FormData): Promise<R> {
  const admin = await getAdmin();
  if (!admin.permissions.has("trust")) return { ok: false, error: "You need the Trust & Safety permission." };
  const type = String(f.get("type") ?? ""), id = String(f.get("subject_id") ?? "").trim(), reason = String(f.get("reason") ?? "").trim();
  const active = String(f.get("active") ?? "grant") === "grant", expires = String(f.get("expires") ?? "");
  if (!["workspace", "user"].includes(type) || !UUID.test(id)) return { ok: false, error: "Choose a workspace or user id." };
  if (reason.length < 10) return { ok: false, error: "Explain the legal basis (at least 10 characters) — e.g. counsel advice reference or licence." };
  const { error } = await admin.db.rpc("admin_sanctions_override_set" as never, { p_type: type, p_id: id, p_active: active, p_reason: reason,
    p_expires: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? `${expires}T23:59:59Z` : null } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You need the Trust & Safety permission on a verified (MFA) session." : "Couldn’t save the override." };
  revalidatePath("/admin/compliance");
  return { ok: true, message: active ? "Override granted and audited." : "Override revoked and audited." };
}

/** Q74 (D2): mark a compliance signal (tax not collected / sanctioned billing country) reviewed, with the action taken. */
export async function reviewComplianceSignal(f: FormData): Promise<R> {
  const admin = await getAdmin();
  if (!admin.permissions.has("commerce") && !admin.permissions.has("trust")) return { ok: false, error: "You need the Commerce or Trust permission." };
  const id = String(f.get("id") ?? ""), note = String(f.get("note") ?? "").trim();
  if (!UUID.test(id) || note.length < 5) return { ok: false, error: "Record what was done (at least 5 characters)." };
  const { error } = await admin.db.rpc("admin_review_compliance_signal" as never, { p_id: id, p_note: note } as never);
  if (error) return { ok: false, error: /record_not_found/.test(error.message) ? "Already reviewed." : "Couldn’t save." };
  revalidatePath("/admin/compliance");
  return { ok: true, message: "Marked reviewed." };
}
