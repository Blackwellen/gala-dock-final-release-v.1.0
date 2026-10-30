"use server";
import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/admin/context";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/workspace/rpc";

/** Manual AI credit adjustment (grant, promo, refund, reversal) — agent_ops only; the RPC validates and writes the audit event. */
export async function grantCredits(fd: FormData): Promise<ActionResult> {
  const admin = await getAdmin();
  if (!admin.permissions.has("agent_ops")) return { ok: false, error: "Granting credits needs the Agent Ops permission." };
  const ws = String(fd.get("workspace") ?? ""), kind = String(fd.get("kind") ?? "grant"), reference = String(fd.get("reference") ?? "").trim();
  const credits = Number(fd.get("credits")), expires = String(fd.get("expires") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ws)) return { ok: false, error: "Choose a workspace." };
  if (!Number.isFinite(credits) || credits === 0 || Math.abs(credits) > 100000) return { ok: false, error: "Enter a credit amount between -100,000 and 100,000 (not zero)." };
  if (kind === "reversal" ? credits > 0 : credits < 0) return { ok: false, error: kind === "reversal" ? "Reversals must be negative." : "Grants, promos and refunds must be positive." };
  if (reference.length < 5) return { ok: false, error: "Add a reference (ticket, case or reason, at least 5 characters)." };
  const { error } = await untyped(admin.db as never).rpc("admin_grant_credits", { p_workspace: ws, p_credits: credits, p_kind: kind, p_reference: reference.slice(0, 200), p_expires: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null });
  if (error) return { ok: false, error: "Couldn’t record the adjustment." };
  revalidatePath("/admin/agent-integrations/credits");
  return { ok: true, message: `${credits > 0 ? "Added" : "Removed"} ${Math.abs(credits).toLocaleString("en-GB")} credits` };
}

/** Finance enters the provider's actual monthly bill (commerce only); the RPC validates, upserts per provider/month and audits. */
export async function recordProviderInvoice(fd: FormData): Promise<ActionResult> {
  const admin = await getAdmin();
  if (!admin.permissions.has("commerce")) return { ok: false, error: "Recording provider invoices needs the Commerce permission." };
  const provider = String(fd.get("provider") ?? ""), month = String(fd.get("month") ?? ""), currency = String(fd.get("currency") ?? "USD").toUpperCase();
  const amount = Number(fd.get("amount")), fx = Number(fd.get("fx")), reference = String(fd.get("reference") ?? "").trim();
  if (!["azure_openai", "anthropic"].includes(provider)) return { ok: false, error: "Choose the provider." };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Choose the invoice month." };
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return { ok: false, error: "Enter the invoice amount." };
  if (!Number.isFinite(fx) || fx <= 0 || fx > 10) return { ok: false, error: "Enter the exchange rate to GBP (e.g. 0.79)." };
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Use a three-letter currency code." };
  if (reference.length < 3) return { ok: false, error: "Add the invoice number." };
  const { error } = await untyped(admin.db as never).rpc("admin_record_ai_provider_invoice", { p_period: `${month}-01`, p_amount: amount, p_currency: currency, p_fx: fx, p_reference: reference.slice(0, 200), p_provider: provider });
  if (error) return { ok: false, error: "Couldn’t record the invoice." };
  revalidatePath("/admin/agent-integrations/credits");
  return { ok: true, message: `Recorded ${provider.replace("_", " ")} invoice for ${month}` };
}
