import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { hasPasswordLogin } from "@/lib/settings/reauth";
import { TransferCancel, TransferRequestForm, TransferRespond } from "./ownership-transfer-client";

type Transfer = { id: string; from_user: string; to_user: string; expires_at: string; created_at: string };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/**
 * Q67 ownership transfer panel (organiser and provider Settings → Team & Access). Owner: request / cancel, with the database's
 * blockers listed up front. Invited manager: accept / decline. Other managers: see that a transfer is pending.
 */
export async function OwnershipTransfer({ workspaceId, workspaceName, managers, className = "k-card st-c" }: { workspaceId: string; workspaceName: string; managers: { id: string; name: string }[]; className?: string }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const db = untyped(sb as never);
  const [{ data: ws }, { data: pendingRows }] = await Promise.all([
    db.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle(),
    db.from("workspace_ownership_transfers").select("id,from_user,to_user,expires_at,created_at").eq("workspace_id", workspaceId).eq("status", "pending").gt("expires_at", new Date().toISOString()).limit(1),
  ]);
  const owner = (ws as { owner_id?: string } | null)?.owner_id === user.id;
  const t = ((pendingRows ?? []) as Transfer[])[0];
  const forMe = t && t.to_user === user.id;
  if (!owner && !forMe && !t) return null;
  const name = (id: string) => managers.find(m => m.id === id)?.name ?? "a manager";
  const { data: blockers } = owner && !t ? await db.rpc("ownership_transfer_blockers", { p_ws: workspaceId, p_to: managers[0]?.id ?? user.id }) : { data: [] };
  const list = ((blockers ?? []) as { code: string; detail: string }[]).filter(b => !b.code.startsWith("target_"));   // target checks depend on who is chosen
  return <section className={className} aria-labelledby="xfer-h" style={{ display: "grid", gap: 10 }}>
    <h2 id="xfer-h">Workspace ownership</h2>
    {forMe ? <>
      <p className="k-notice amber" role="status">The owner asked to make you the owner of <b>{workspaceName}</b>. Answer by {day(t.expires_at)}.</p>
      <TransferRespond transferId={t.id} workspaceName={workspaceName} needsPassword={hasPasswordLogin(user)} />
    </> : t ? <>
      <p className="k-small">Waiting for <b>{name(t.to_user)}</b> to accept ownership (requested {day(t.created_at)}, expires {day(t.expires_at)}). Nothing changes until they accept.</p>
      {owner && <div><TransferCancel transferId={t.id} /></div>}
    </> : <>
      <p className="k-small">Hand the workspace to an active manager. They must accept; you then become a manager. Billing, roles and payout setup move to them, and both of you are notified.</p>
      {list.length > 0 && <div className="k-notice red" role="alert"><b>Ownership can&apos;t move right now:</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{list.map(b => <li key={b.code}>{b.detail}</li>)}</ul></div>}
      <TransferRequestForm workspaceId={workspaceId} workspaceName={workspaceName} managers={managers} needsPassword={hasPasswordLogin(user)} blocked={list.length > 0} />
    </>}
  </section>;
}
