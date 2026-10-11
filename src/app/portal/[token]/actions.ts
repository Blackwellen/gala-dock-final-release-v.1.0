"use server";

import { createClient } from "@/lib/supabase/server";
import { untyped, isUuid } from "@/lib/workspace/db";
import { hashToken, isTokenFormat } from "@/lib/security";

/* Client actions on a shared portal link. The token is re-validated by the database on every call (hash, expiry,
   revocation, per-link rate limit) — nothing here trusts the page that rendered the form. Server Actions also
   enforce same-origin POSTs. */

type Result = { ok: true } | { ok: false; error: string };

function failure(message: string): Result {
  if (message.includes("rate_limited")) return { ok: false, error: "Too many actions from this link. Please try again later." };
  if (message.includes("note_required")) return { ok: false, error: "Add a short note so the organiser knows what to change." };
  if (message.includes("invalid_link")) return { ok: false, error: "This link has expired or been revoked." };
  if (message.includes("invalid_input")) return { ok: false, error: "Please check what you entered." };
  return { ok: false, error: "That didn't go through. Please try again." };
}

export async function decideApproval(token: string, approvalId: string, decision: "approved" | "rejected", note: string): Promise<Result> {
  if (!isTokenFormat(token) || !isUuid(approvalId) || !["approved", "rejected"].includes(decision) || typeof note !== "string" || note.length > 1000) return { ok: false, error: "Invalid request." };
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("portal_decide", { p_token_hash: hashToken(token), p_approval: approvalId, p_decision: decision, p_note: note });
  return error ? failure(error.message) : { ok: true };
}

export async function postComment(token: string, body: string): Promise<Result> {
  if (!isTokenFormat(token) || typeof body !== "string") return { ok: false, error: "Invalid request." };
  const text = body.trim();
  if (!text || text.length > 2000) return { ok: false, error: "Messages must be between 1 and 2,000 characters." };
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("portal_comment", { p_token_hash: hashToken(token), p_body: text });
  return error ? failure(error.message) : { ok: true };
}
