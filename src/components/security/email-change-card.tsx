import { createClient } from "@/lib/supabase/server";
import { hasPasswordLogin } from "@/lib/settings/reauth";
import { EmailChangeForm } from "./email-change-form";

const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : null;

/**
 * Q67 sign-in email card (customer Account → Privacy & Security, organiser and provider Settings → Security). Server-rendered state:
 * current address, a pending change (Supabase keeps `new_email` until both confirmation links are used) and a just-completed change.
 * `status` comes from the confirmation link's return (?email=link).
 */
export async function EmailChangeCard({ className = "ce-card ac-card", status }: { className?: string; status?: string }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const pending = user.new_email && user.new_email !== user.email ? user.new_email : null;
  return <section className={className} id="email" aria-labelledby="email-h">
    <h2 id="email-h">Sign-in email</h2>
    <p className="ac-hint k-small">You sign in and receive account emails at <b>{user.email}</b>.</p>
    {status === "link" && !pending && <p className="k-notice green" role="status">Your sign-in email is now <b>{user.email}</b>.</p>}
    {pending ? <p className="k-notice amber" role="status">
        Change to <b>{pending}</b> is waiting for confirmation{user.email_change_sent_at ? ` (links sent ${when(user.email_change_sent_at)})` : ""}. Open the links we sent to <b>both</b> addresses — your
        sign-in email stays <b>{user.email}</b> until both are confirmed. Links expire after an hour; you can send new ones below.
        {status === "link" && " One link is confirmed — now open the one sent to the other address."}
      </p> : null}
    <EmailChangeForm current={user.email ?? ""} needsPassword={hasPasswordLogin(user)} pending={!!pending} />
    <p className="k-small k-muted" style={{ marginTop: 8 }}>For your security we ask for your password{" "}(and your authenticator code if two-step verification is on), tell your current address, and record the change in your account&apos;s audit log. Any Gala Dock plan billing contact you own moves to the new address automatically.</p>
  </section>;
}
