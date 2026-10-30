import { untyped, type Db } from "@/lib/workspace/db";
import { AssetsClient, GalleriesClient, BrandClient, type Asset, type Gallery } from "./media-assets-client";

export type MediaTab = "library" | "galleries" | "brand";

/**
 * /organizer/media — Library, Galleries and Brand tabs (Q23 domains 148–149), alongside the Studio's designs/templates tabs.
 * Library: rights metadata editor + public-use problem badges (media_assets_problems) + usages. Galleries: create, order,
 * add/remove, publish (every item checked). Brand: versioned kit colours/fonts/rules and brand_check_design per design.
 */
export async function MediaAssetsWorkspace({ db, workspaceId, tab, role }: { db: Db; workspaceId: string; tab: MediaTab; role: string }) {
  const sb = untyped(db as never);
  const canManage = ["owner", "manager"].includes(role);
  const { data: evs } = await sb.from("events").select("id,name").eq("workspace_id", workspaceId).order("starts_at", { ascending: false }).limit(200);
  const events = (evs ?? []) as { id: string; name: string }[];
  const cols = "id,event_id,workspace_id,kind,title,url,status,alt_text,licence,licence_holder,licence_expires_at,credit,usage_scope,subject,created_at";
  const [{ data: own }, { data: byEvent }, { data: probs }] = await Promise.all([
    sb.from("media_assets").select(cols).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(200),
    events.length ? sb.from("media_assets").select(cols).is("workspace_id", null).in("event_id", events.map(e => e.id)).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    sb.rpc("media_assets_problems", { p_workspace: workspaceId, p_event: null }),
  ]);
  const pm = new Map(((probs ?? []) as { asset_id: string; problems: string[] }[]).map(x => [x.asset_id, x.problems]));
  const evName = new Map(events.map(e => [e.id, e.name]));
  const assets: Asset[] = [...((own ?? []) as Asset[]), ...((byEvent ?? []) as Asset[])].map(a => ({ ...a, problems: pm.get(a.id) ?? [], event_name: a.event_id ? evName.get(a.event_id) ?? null : null }));

  if (tab === "library") {
    const ids = assets.map(a => a.id);
    const { data: us } = ids.length ? await sb.from("media_usages").select("asset_id,target_kind,target_id,public_use,created_at").in("asset_id", ids) : { data: [] };
    return <AssetsClient assets={assets} usages={(us ?? []) as { asset_id: string; target_kind: string; target_id: string; public_use: boolean; created_at: string }[]} canManage={canManage} />;
  }
  if (tab === "galleries") {
    const { data: gs } = await sb.from("media_galleries").select("id,title,event_id,visibility,status,version,updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(50);
    const gids = ((gs ?? []) as { id: string }[]).map(g => g.id);
    const { data: items } = gids.length ? await sb.from("media_gallery_items").select("gallery_id,asset_id,sort,caption").in("gallery_id", gids).order("sort") : { data: [] };
    const galleries: Gallery[] = ((gs ?? []) as Omit<Gallery, "items">[]).map(g => ({ ...g, items: ((items ?? []) as { gallery_id: string; asset_id: string; sort: number; caption: string | null }[]).filter(i => i.gallery_id === g.id) }));
    return <GalleriesClient workspaceId={workspaceId} galleries={galleries} assets={assets} events={events} canManage={canManage} />;
  }
  const [{ data: kit }, { data: versions }, { data: designs }] = await Promise.all([
    sb.from("brand_kits").select("colors,fonts,logos,rules,version,updated_at").eq("workspace_id", workspaceId).maybeSingle(),
    sb.from("brand_kit_versions").select("version,created_at,snapshot").eq("workspace_id", workspaceId).order("version", { ascending: false }).limit(12),
    sb.from("designs").select("id,title,updated_at").eq("workspace_id", workspaceId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(30),
  ]);
  return <BrandClient workspaceId={workspaceId} kit={kit as never} versions={(versions ?? []) as never} designs={(designs ?? []) as { id: string; title: string; updated_at: string }[]} canManage={canManage} />;
}
