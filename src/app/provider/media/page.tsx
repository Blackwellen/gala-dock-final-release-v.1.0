import { getProvider } from "@/lib/provider/context";
import { MediaLibrary } from "@/components/media/library";

export const metadata = { title: "Media Studio" };

export default async function ProviderMediaPage({ searchParams }: PageProps<"/provider/media">) {
  const sp = await searchParams;
  const ctx = await getProvider();
  const tab = sp.tab === "templates" || sp.tab === "community" ? sp.tab : "designs";
  return <MediaLibrary db={ctx.db} workspaceId={ctx.workspace.id} base="/provider/media" tab={tab} q={typeof sp.q === "string" ? sp.q : undefined} deleted={typeof sp.deleted === "string" ? sp.deleted : undefined} />;
}
