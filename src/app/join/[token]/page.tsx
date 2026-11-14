import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import "@/styles/portal-shell.css";
import "@/styles/portal-partner.css";
import { createClient } from "@/lib/supabase/server";
import { hashToken, isTokenFormat, tokenPageAllowed } from "@/lib/security";
import { untyped } from "@/lib/workspace/db";
import { AcceptInvite } from "./accept";

export const metadata: Metadata = { title: "Accept your invitation · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Preview = { kind: "partner" | "promoter"; title: string; detail: string; state: "valid" | "expired" | "used" | "revoked"; expires_at: string };
const STATE: Record<Exclude<Preview["state"], "valid">, string> = {
  expired: "This invitation has expired. Ask whoever invited you to send a new one.",
  used: "This invitation has already been used. Sign in to open your portal.",
  revoked: "This invitation was replaced by a newer one. Use the link in the most recent email.",
};

/** Q68: partner / promoter portal login invitations (portal_invites: hashed single-use token, bound to the invited email). */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTokenFormat(token) || !(await tokenPageAllowed("join", await headers()))) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await untyped(supabase).rpc("portal_invite_preview", { p_token_hash: hashToken(token) });
  const invite = ((data ?? []) as Preview[])[0];
  if (!invite) notFound();
  const next = encodeURIComponent(`/join/${token}`);
  const portal = invite.kind === "partner" ? "partner portal" : "promoter portal";
  return <main className="pr-join">
    <section className="pt-panel">
      <small>{invite.kind === "partner" ? "Gala Dock Partner Programme" : "Gala Dock promoter invitation"}</small>
      <h1>{invite.title}</h1>
      <p>{invite.detail}</p>
      {invite.state !== "valid" ? <p className="pt-notice amber">{STATE[invite.state]}</p>
        : user ? <AcceptInvite token={token} email={user.email ?? ""} portal={portal} />
        : <><p>Sign in or create a free account with the email address this invitation was sent to, then accept it to open your {portal}.</p>
          <div className="pr-join-actions"><Link className="pt-btn primary" href={`/login?next=${next}`}>Sign in</Link><Link className="pt-btn outline" href={`/register?next=${next}`}>Create account</Link></div></>}
    </section>
  </main>;
}
