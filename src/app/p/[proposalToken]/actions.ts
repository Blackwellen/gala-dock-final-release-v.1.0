"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SignResult {
  ok: boolean;
  error?: string;
  signedName?: string;
  signedAt?: string;
}

/** Best-effort client IP from common proxy headers. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? null;
}

/**
 * Public e-signature submission. Uses the service-role client because the
 * visitor has no session/RLS access. Validated transition: only sent/viewed
 * proposals can be signed.
 */
export async function signProposal(input: {
  token: string;
  name: string;
  agreed: boolean;
}): Promise<SignResult> {
  if (!input.agreed) return { ok: false, error: "You must agree to the terms to sign." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Please enter your full name." };

  const supabase = createAdminClient();

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, status, signed_by_name, signed_at, client_email, valid_until, deleted_at")
    .eq("share_token", input.token)
    .maybeSingle();

  if (!proposal || proposal.deleted_at) {
    return { ok: false, error: "This proposal could not be found." };
  }
  if (proposal.status === "signed" || proposal.status === "converted") {
    return { ok: false, error: "This proposal has already been signed." };
  }
  if (proposal.status === "declined") {
    return { ok: false, error: "This proposal has been declined." };
  }
  if (proposal.status !== "sent" && proposal.status !== "viewed") {
    return { ok: false, error: "This proposal is not available for signing." };
  }
  if (proposal.valid_until) {
    const due = new Date(proposal.valid_until);
    due.setHours(23, 59, 59, 999);
    if (due.getTime() < Date.now()) {
      return { ok: false, error: "This proposal has expired." };
    }
  }

  const signedAt = new Date().toISOString();
  const ip = await clientIp();

  const { error } = await supabase
    .from("proposals")
    .update({
      status: "signed",
      signed_by_name: name,
      signed_by_email: proposal.client_email,
      signed_at: signedAt,
      signed_ip: ip,
      updated_at: signedAt,
    })
    .eq("id", proposal.id);

  if (error) return { ok: false, error: "Could not record your signature. Please try again." };

  return { ok: true, signedName: name, signedAt };
}

/** Decline a proposal from the public page. */
export async function declineProposal(token: string): Promise<SignResult> {
  const supabase = createAdminClient();
  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, status, deleted_at")
    .eq("share_token", token)
    .maybeSingle();

  if (!proposal || proposal.deleted_at) return { ok: false, error: "Proposal not found." };
  if (proposal.status !== "sent" && proposal.status !== "viewed") {
    return { ok: false, error: "This proposal can no longer be declined." };
  }

  const { error } = await supabase
    .from("proposals")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", proposal.id);

  if (error) return { ok: false, error: "Could not record your response." };
  return { ok: true };
}
