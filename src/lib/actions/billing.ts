"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";
import { buyCreditPack, choosePlan, setCancelAtPeriodEnd } from "@/lib/billing/service";

type Result = { ok: true; message?: string; redirect?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

async function caller() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}
async function origin() {
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.galadock.com";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}
const back = (kind: string) => kind === "provider" ? "/provider/settings?tab=billing" : "/organizer/settings?tab=billing";

/** Plan upgrade/downgrade (Q28). The service re-checks that the caller owns the workspace; prices come from plan_prices. */
export async function choosePlanAction(workspaceId: string, kind: string, plan: string, interval: string): Promise<Result> {
  const user = await caller(); if (!user) return { ok: false, error: "Please sign in again." };
  if (!UUID.test(workspaceId) || !["pro", "business", "enterprise"].includes(plan) || !["month", "year"].includes(interval)) return { ok: false, error: "Choose a plan." };
  if (!(await rateLimit(`billing:${user.id}`, 10, 600))) return { ok: false, error: "Too many attempts — try again in a few minutes." };
  const r = await choosePlan({ workspaceId, userId: user.id, email: user.email ?? null, plan, interval, origin: await origin(), returnPath: back(kind) });
  if (!r.ok) return r;
  revalidatePath(back(kind).split("?")[0]!);
  return { ok: true, message: r.message, ...(r.url ? { redirect: r.url } : {}) };
}

export async function cancelPlanAction(workspaceId: string, kind: string, cancel: boolean): Promise<Result> {
  const user = await caller(); if (!user) return { ok: false, error: "Please sign in again." };
  if (!UUID.test(workspaceId)) return { ok: false, error: "Workspace not found." };
  if (!(await rateLimit(`billing:${user.id}`, 10, 600))) return { ok: false, error: "Too many attempts — try again in a few minutes." };
  const r = await setCancelAtPeriodEnd({ workspaceId, userId: user.id, cancel });
  if (!r.ok) return r;
  revalidatePath(back(kind).split("?")[0]!);
  return { ok: true, message: r.message };
}

export async function buyCreditPackAction(workspaceId: string, kind: string, packId: string): Promise<Result> {
  const user = await caller(); if (!user) return { ok: false, error: "Please sign in again." };
  if (!UUID.test(workspaceId) || !UUID.test(packId)) return { ok: false, error: "Choose a credit pack." };
  if (!(await rateLimit(`billing:${user.id}`, 10, 600))) return { ok: false, error: "Too many attempts — try again in a few minutes." };
  const r = await buyCreditPack({ workspaceId, userId: user.id, email: user.email ?? null, packId, origin: await origin(), returnPath: kind === "provider" ? "/provider/settings?tab=agent" : "/organizer/settings?tab=agent" });
  return r.ok ? { ok: true, message: r.message, ...(r.url ? { redirect: r.url } : {}) } : r;
}
