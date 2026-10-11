import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { untyped } from "@/lib/workspace/db";

/** Notification deep link: opens the conversation in the portal whose seat is a participant (workspace inbox first). */
export default async function MessageRedirect({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/messages/${id}`);
  const db = untyped(supabase as never);
  const { data: parts } = await db.from("conversation_participants").select("user_id,workspace_id,workspaces(kind)").eq("conversation_id", id);
  if (!parts?.length) notFound();
  const ws = (parts as unknown as { user_id: string | null; workspace_id: string | null; workspaces: { kind: string } | null }[]).find(p => p.workspace_id && p.workspaces);
  if ((parts as { user_id: string | null }[]).some(p => p.user_id === user.id) || !ws) redirect(`/account/inbox?c=${id}`);
  redirect(`/${ws.workspaces!.kind === "provider" ? "provider" : "organizer"}/inbox?c=${id}`);
}
