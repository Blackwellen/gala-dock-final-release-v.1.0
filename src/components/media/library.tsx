import Link from "next/link";
import { untyped, type Db } from "@/lib/workspace/db";
import { LayerView } from "./layer-view";
import { fillCss } from "@/lib/media/render";
import { NewDesign, TemplateCard } from "./library-client";
import { DesignMenu, DeletedBanner } from "./design-menu";
import type { DesignDoc } from "@/lib/media/document";
import "@/styles/studio.css";

type Tab = "designs" | "templates" | "community";

/** Media library (media spec §5, §8–9): the workspace's designs, its templates and the public community gallery. */
export async function MediaLibrary({ db, workspaceId, base, tab, q, deleted }: { db: Db; workspaceId: string; base: string; tab: Tab; q?: string; deleted?: string }) {
  const u = untyped(db as never);
  const { data: events } = await db.from("events").select("id,name").eq("workspace_id", workspaceId).order("starts_at", { ascending: false }).limit(50);
  const term = (q ?? "").replace(/[%_,()]/g, " ").trim().slice(0, 60);
  let designs: { id: string; title: string; updated_at: string; document: DesignDoc; status: string }[] = [];
  let templates: { id: string; title: string; category: string; document: DesignDoc; usage_count: number; visibility: string }[] = [];
  if (tab === "designs") {
    let query = u.from("designs").select("id,title,updated_at,document,status").eq("workspace_id", workspaceId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(60);
    if (term) query = query.ilike("title", `%${term}%`);
    designs = ((await query).data ?? []) as typeof designs;
  } else {
    let query = u.from("design_templates").select("id,title,category,document,usage_count,visibility").eq("status", "active").order(tab === "community" ? "usage_count" : "created_at", { ascending: false }).limit(60);
    query = tab === "community" ? query.eq("visibility", "public") : query.or(`workspace_id.eq.${workspaceId},and(workspace_id.is.null,owner_id.is.null)`);
    if (term) query = query.ilike("title", `%${term}%`);
    templates = ((await query).data ?? []) as typeof templates;
  }
  return <div className="ml">
    <div className="ml-head"><h1>Media Studio</h1><NewDesign workspaceId={workspaceId} events={(events ?? []).map(e => ({ id: e.id, name: e.name }))} /></div>
    {deleted && /^[0-9a-f-]{36}$/i.test(deleted) && <DeletedBanner id={deleted} library={base} />}
    <nav className="ml-tabs" aria-label="Library">{([["designs", "My designs"], ["templates", "Templates"], ["community", "Community"]] as const).map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} className={tab === k ? "on" : ""}>{l}</Link>)}</nav>
    <form className="st-row" action={base}><input type="hidden" name="tab" value={tab} /><input className="st-input" name="q" defaultValue={term} placeholder="Search by name" style={{ maxWidth: 320 }} /><button className="st-btn">Search</button></form>
    {tab === "designs" ? (designs.length ? <div className="ml-grid">{designs.map(d => <div key={d.id} className="ml-card ml-design"><Link href={`/studio/${d.id}`} className="ml-open"><Thumb doc={d.document} /><b>{d.title}</b><small>Edited {new Date(d.updated_at).toLocaleDateString("en-GB")}</small></Link><DesignMenu id={d.id} title={d.title} library={base} /></div>)}</div>
      : <p className="ml-empty">No designs yet. Start with a blank size, your event poster, or a template.</p>)
      : templates.length ? <div className="ml-grid">{templates.map(t => <TemplateCard key={t.id} id={t.id} title={t.title} meta={`${t.category.replace(/_/g, " ")} · used ${t.usage_count}×`} workspaceId={workspaceId} community={tab === "community"}><Thumb doc={t.document} /></TemplateCard>)}</div>
      : <p className="ml-empty">{tab === "community" ? "No community templates yet." : "No templates yet. Open a design and choose Template to save one."}</p>}
  </div>;
}

/** Scaled, static render of the first page — the same renderer the editor and exporter use. */
export function Thumb({ doc }: { doc: DesignDoc }) {
  const p = doc.pages?.[0]; if (!p) return <div className="ml-thumb" />;
  const s = 180 / Math.max(p.width, p.height);
  return <div className="ml-thumb" aria-hidden="true"><div style={{ width: p.width, height: p.height, transform: `translate(${(180 - p.width * s) / 2}px,${(180 - p.height * s) / 2}px) scale(${s})`, background: fillCss(p.background) }}>
    {p.layers.map(l => <LayerView key={l.id} l={l} data={{}} />)}</div></div>;
}
