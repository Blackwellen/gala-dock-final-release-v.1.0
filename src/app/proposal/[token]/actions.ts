"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

type Rpc = (fn: string, args: object) => Promise<{ data: unknown; error: { message: string } | null }>;
export async function acceptProposal(token: string, name: string, email: string, version: number, pkg: string | null = null) {
  if (!/^[0-9a-f]{36}$/.test(token)) return { ok: false, error: "Invalid link." };
  if (pkg !== null && !/^[a-z0-9_-]{1,24}$/.test(pkg)) return { ok: false, error: "Choose a package." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`accept:${ip}`, 10, 3600))) return { ok: false, error: "Too many attempts. Try again later." };
  const sb = await createClient();
  const args = { p_token: token, p_name: name.trim(), p_email: email.trim(), p_version: version, ...(pkg ? { p_package: pkg } : {}) };
  const { data, error } = await (sb as unknown as { rpc: Rpc }).rpc("accept_proposal", args);
  if (error) return { ok: false, error: error.message.includes("version_changed") ? "This proposal was updated. Refresh to review the latest version." : error.message.includes("invalid_input") ? "Enter your full name and a valid email." : error.message.includes("package") ? "Choose one of the packages to accept." : "This proposal can't be accepted." };
  return { ok: true, result: data as string };
}
