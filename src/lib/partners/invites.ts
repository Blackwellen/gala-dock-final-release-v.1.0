import "server-only";
import { createInviteToken } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped, type Db } from "@/lib/workspace/db";

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.galadock.com").replace(/\/+$/, "");

/**
 * Q68 portal login invitation (partner or promoter). The RPC runs as the inviting user (it checks their permission and audits);
 * only the token's hash is stored on the invite. The email goes through the transactional outbox (Resend worker, retries,
 * suppression list). The link is bound to the invited address: accepting needs a signed-in account with that email.
 */
export async function sendPortalInvite(db: Db, opts: { rpc: "admin_partner_invite" | "promoter_invite"; args: Record<string, unknown>; email: string; subject: string; body: string }) {
  const { token, hash } = createInviteToken();
  const { error } = await db.rpc(opts.rpc, { ...opts.args, p_email: opts.email, p_token_hash: hash });
  if (error) return { ok: false as const, error };
  const link = `/join/${token}`;
  const { error: mailError } = await untyped(createAdminClient() as never).from("email_outbox").insert({
    to_email: opts.email, category: "security", subject: opts.subject.slice(0, 200),
    body: `${opts.body}\n\nThe link works for 14 days and only for ${opts.email}. If you weren’t expecting this, you can ignore this email.`, link,
  });
  return { ok: true as const, link: `${site()}${link}`, emailed: !mailError };
}
