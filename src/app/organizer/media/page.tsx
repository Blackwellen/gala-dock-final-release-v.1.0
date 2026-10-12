import { getOrganizer } from "@/lib/data/context";
import { MediaLibrary } from "@/components/media/library";

export const metadata = { title: "Media Studio" };

export default async function OrganizerMediaPage({ searchParams }: PageProps<"/organizer/media">) {
  const sp = await searchParams;
  const ctx = await getOrganizer("/organizer/media");
  const tab = sp.tab === "templates" || sp.tab === "community" ? sp.tab : "designs";
  return <MediaLibrary db={ctx.supabase} workspaceId={ctx.workspace.id} base="/organizer/media" tab={tab} create={sp.create === '1'} canCreate={["owner","manager","member"].includes(ctx.role)} q={typeof sp.q === "string" ? sp.q : undefined} deleted={typeof sp.deleted === "string" ? sp.deleted : undefined} />;
}
