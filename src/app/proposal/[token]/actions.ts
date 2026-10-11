"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

export async function acceptProposal(token: string, name: string, email: string, version: number) {
  if (!/^[0-9a-f]{36}$/.test(token)) return { ok: false, error: "Invalid link." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`accept:${ip}`, 10, 3600))) return { ok: false, error: "Too many attempts. Try again later." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("accept_proposal", { p_token: token, p_name: name.trim(), p_email: email.trim(), p_version: version });
  if (error) return { ok: false, error: error.message.includes("version_changed") ? "This proposal was updated. Refresh to review the latest version." : error.message.includes("invalid_input") ? "Enter your full name and a valid email." : "This proposal can't be accepted." };
  return { ok: true, result: data as string };
}
