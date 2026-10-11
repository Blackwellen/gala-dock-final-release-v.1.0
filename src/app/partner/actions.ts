"use server";

import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

/** Opens a support case for the signed-in partner (partner_contact_support validates partnership + rate limit). */
export async function contactSupport(subject: string, body: string): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  if (typeof subject !== "string" || typeof body !== "string") return { ok: false, error: "Invalid request." };
  const s = subject.trim(), b = body.trim();
  if (s.length < 3 || s.length > 200 || b.length < 10 || b.length > 5000) return { ok: false, error: "Add a subject and at least a sentence describing the issue." };
  const sb = untyped(await createClient());
  const { data, error } = await sb.rpc("partner_contact_support", { p_subject: s, p_body: b });
  if (error) return { ok: false, error: error.message.includes("rate_limited") ? "You’ve sent several requests recently — please wait a little before sending another." : error.message.includes("not_allowed") ? "Only partner accounts can contact partner support here." : "Couldn’t send — please try again." };
  return { ok: true, reference: String(data) };
}
