import { notFound, redirect } from "next/navigation";
import { requireUser, listWorkspaceAccess } from "@/lib/auth";
import { untyped } from "@/lib/workspace/db";

/**
 * Notification deep link: opens the conversation in the portal whose seat is a participant. Q52: it used to pick the FIRST
 * workspace participant, which in an organiser ↔ provider conversation is often the other side, so an organiser landed in
 * /provider/inbox (no access). Now only the caller's own seats count: their personal seat, else a workspace they actively belong
 * to (switching to it when it isn't the current one).
 */
export default async function MessageRedirect({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/messages/${id}`);
  const db = untyped(supabase as never);
  const { data: parts } = await db.from("conversation_participants").select("user_id,workspace_id").eq("conversation_id", id).is("left_at", null);
  const rows = (parts ?? []) as { user_id: string | null; workspace_id: string | null }[];
  if (!rows.length) notFound();
  if (rows.some(p => p.user_id === user.id)) redirect(`/account/inbox?c=${id}`);
  const access = (await listWorkspaceAccess(supabase)).filter(w => w.member_status === "active" && w.workspace_status === "active" && (w.kind === "organizer" || w.kind === "provider"));
  const mine = access.find(w => rows.some(p => p.workspace_id === w.id));
  if (!mine) redirect(`/account/inbox?c=${id}`);
  // Make the conversation's workspace the current one so the inbox opens in the right seat.
  await supabase.rpc("remember_workspace", { p_workspace: mine.id });
  redirect(`/${mine.kind === "provider" ? "provider" : "organizer"}/inbox?c=${id}`);
}
