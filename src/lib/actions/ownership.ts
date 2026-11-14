"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { ownershipError } from "@/lib/settings/rules";
import { reauthenticate } from "@/lib/settings/reauth";
import type { ActionResult } from "./shell";

/**
 * Q67 workspace ownership transfer (owner → an active manager). All rules live in the database commands
 * (request/respond/cancel_ownership_transfer, migration 202611146901): owner-only, typed workspace-name confirmation, step-up,
 * blockers, one pending request, atomic role swap under the workspace row lock, audit, notifications to both people and the
 * Stripe billing-contact sync job. These actions add re-authentication (password or a fresh sign-in) on both sides.
 */
const Id = z.string().uuid();
const bump = () => { revalidatePath("/organizer/settings"); revalidatePath("/provider/settings"); revalidatePath("/organizer", "layout"); revalidatePath("/provider", "layout"); };
async function caller() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

export async function requestOwnershipTransfer(workspaceId: string, toUser: string, values: { confirm?: string; password?: string }): Promise<ActionResult> {
  if (!Id.safeParse(workspaceId).success || !Id.safeParse(toUser).success) return { ok: false, error: "Choose a manager." };
  const { sb, user } = await caller(); if (!user) return { ok: false, error: "Please sign in again." };
  if (!(values.confirm ?? "").trim()) return { ok: false, error: "Type the workspace name exactly to confirm." };
  if (!(await rateLimit(`ownership:${user.id}`, 10, 3600))) return { ok: false, error: "Too many attempts. Try again later." };
  const denied = await reauthenticate(sb, user, values.password ?? "", workspaceId); if (denied) return { ok: false, error: denied };
  const { error } = await untyped(sb as never).rpc("request_ownership_transfer", { p_ws: workspaceId, p_to: toUser, p_confirm: values.confirm ?? "" });
  if (error) return { ok: false, error: ownershipError(error.message, (error as { details?: string }).details) };
  bump(); return { ok: true, message: "Request sent. Nothing changes until they accept (within 7 days)." };
}

export async function respondOwnershipTransfer(transferId: string, accept: boolean, values: { password?: string } = {}): Promise<ActionResult> {
  if (!Id.safeParse(transferId).success) return { ok: false, error: "Request not found." };
  const { sb, user } = await caller(); if (!user) return { ok: false, error: "Please sign in again." };
  if (accept) {
    if (!(await rateLimit(`ownership:${user.id}`, 10, 3600))) return { ok: false, error: "Too many attempts. Try again later." };
    const { data: t } = await untyped(sb as never).from("workspace_ownership_transfers").select("workspace_id").eq("id", transferId).maybeSingle();
    const denied = await reauthenticate(sb, user, values.password ?? "", (t as { workspace_id?: string } | null)?.workspace_id ?? null); if (denied) return { ok: false, error: denied };
  }
  const { data, error } = await untyped(sb as never).rpc("respond_ownership_transfer", { p_transfer: transferId, p_accept: accept });
  if (error) return { ok: false, error: ownershipError(error.message, (error as { details?: string }).details) };
  const r = (data ?? {}) as { result?: string };
  bump();
  if (r.result === "expired") return { ok: false, error: "This request expired. Ask the owner to send a new one." };
  return { ok: true, message: r.result === "accepted" ? "You're now the owner of this workspace." : "Request declined. The current owner has been told." };
}

export async function cancelOwnershipTransfer(transferId: string): Promise<ActionResult> {
  if (!Id.safeParse(transferId).success) return { ok: false, error: "Request not found." };
  const { sb, user } = await caller(); if (!user) return { ok: false, error: "Please sign in again." };
  const { error } = await untyped(sb as never).rpc("cancel_ownership_transfer", { p_transfer: transferId });
  if (error) return { ok: false, error: ownershipError(error.message) };
  bump(); return { ok: true, message: "Transfer cancelled. You're still the owner." };
}
