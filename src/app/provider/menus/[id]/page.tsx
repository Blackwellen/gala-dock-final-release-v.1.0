import { notFound } from "next/navigation";
import { getProvider } from "@/lib/provider/context";
import { PageHeader, Panel } from "@/components/workspace/kit";
import { MenuForm, SectionForm, ItemForm, EditItem, DeleteRow, DIETARY, type Menu, type MenuItem } from "@/components/venue/menus-client";
import { money } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Menu" };

/** Menu editor: sections, items, variations, dietary tags and the 14 major allergens (§63). */
export default async function MenuEditorPage({ params }: PageProps<"/provider/menus/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getProvider();
  const { data: menu } = await ctx.db.from("menus").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!menu) notFound();
  const [{ data: sections }, { data: items }, { data: listings }] = await Promise.all([
    ctx.db.from("menu_sections").select("id,name,sort").eq("menu_id", id).order("sort").order("name"),
    ctx.db.from("menu_items").select("*").eq("menu_id", id).order("sort").order("name"),
    ctx.db.from("listings").select("id,name").eq("workspace_id", ctx.workspace.id).order("name"),
  ]);
  const secs = (sections ?? []) as { id: string; name: string }[], its = (items ?? []) as MenuItem[];
  const groups = [...secs.map(s => ({ ...s, items: its.filter(i => i.section_id === s.id) })), { id: "", name: "Other items", items: its.filter(i => !i.section_id) }].filter(g => g.id || g.items.length);
  const dl = (k: string) => DIETARY.find(([x]) => x === k)?.[1] ?? k;
  return <>
    <PageHeader title={(menu as Menu).name} subtitle="Sections, items, dietary tags and allergens." back={{ href: "/provider/menus", label: "Food & drink" }} />
    <div className="mk-page"><div className="mk-grid">
      <div style={{ display: "grid", gap: 16 }}>
        {groups.map(g => <Panel key={g.id || "other"} title={g.name}>
          {g.id && ctx.can.manage && <div className="mk-row" style={{ justifyContent: "flex-end" }}><DeleteRow table="menu_sections" id={g.id} label={`section ${g.name}`} /></div>}
          {!g.items.length ? <p className="mk-empty">No items in this section.</p> : <ul className="mk-list">{g.items.map(i => <li key={i.id}>
            <div className="mk-main"><b>{i.name}{!i.available && " (unavailable)"}{i.price ? ` · ${money(i.price)}` : ""}</b>{i.description && <small>{i.description}</small>}
              <small>{i.dietary.map(dl).join(" · ") || "No dietary tags"}{i.allergens.length ? ` · Contains: ${i.allergens.join(", ")}` : " · No major allergens declared"}{i.allergen_note ? ` · ${i.allergen_note}` : ""}</small></div>
            {ctx.can.manage && <span className="mk-row"><EditItem menuId={id} sections={secs} item={i} /><DeleteRow table="menu_items" id={i.id} label={i.name} /></span>}
          </li>)}</ul>}
        </Panel>)}
        {ctx.can.manage && <Panel title="Add an item"><ItemForm menuId={id} sections={secs} /></Panel>}
      </div>
      {ctx.can.manage && <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <Panel title="Sections"><SectionForm menuId={id} /></Panel>
        <Panel title="Menu details"><MenuForm workspaceId={ctx.workspace.id} listings={listings ?? []} menu={menu as Menu} /></Panel>
      </div>}
    </div></div>
  </>;
}
