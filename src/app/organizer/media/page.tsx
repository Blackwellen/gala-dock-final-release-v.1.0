import { getOrganizer } from "@/lib/data/context";
import { MediaLibrary } from "@/components/media/library";
import { MediaAssetsWorkspace, type MediaTab } from "@/components/organizer/media-assets";

export const metadata = { title: "Media Studio" };
const EXTRA: { key: MediaTab; label: string }[] = [{ key: "library", label: "Media library" }, { key: "galleries", label: "Galleries" }, { key: "brand", label: "Brand rules" }];

export default async function OrganizerMediaPage({ searchParams }: PageProps<"/organizer/media">) {
  const sp = await searchParams;
  const ctx = await getOrganizer("/organizer/media");
  const extra = EXTRA.find(t => t.key === sp.tab)?.key;
  const tab = sp.tab === "templates" || sp.tab === "community" ? sp.tab : "designs";
  return <MediaLibrary db={ctx.supabase} workspaceId={ctx.workspace.id} base="/organizer/media" tab={tab} create={sp.create === '1'} canCreate={["owner","manager","member"].includes(ctx.role)} q={typeof sp.q === "string" ? sp.q : undefined} deleted={typeof sp.deleted === "string" ? sp.deleted : undefined}
    extraTabs={EXTRA} extraTab={extra} panel={extra ? <MediaAssetsWorkspace db={ctx.supabase} workspaceId={ctx.workspace.id} tab={extra} role={ctx.role} /> : undefined} />;
}
