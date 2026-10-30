import { notFound } from "next/navigation";
import { getProvider } from "@/lib/provider/context";
import { PageHeader, Panel } from "@/components/workspace/kit";
import { MenuForm, SectionForm, ItemForm, EditItem, DeleteRow, VariantEditor, type Menu, type MenuItem, type MenuVariant } from "@/components/venue/menus-client";
import { DIETARY, COURSES } from "@/components/venue/menu-constants";
import { money } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Menu" };

/**
 * Menu editor (§63, Q13): sections, items, relational variants, course, dietary tags, the 14 UK FIC allergens and "may contain".
 * An item's allergen declaration is explicit (stamped with who/when by menu_items_allergen_guard and audited); undeclared items are
 * flagged here and as hospitality warnings on every booking that uses them.
 */
export default async function MenuEditorPage({ params }: PageProps<"/provider/menus/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getProvider();
  const { data: menu } = await ctx.db.from("menus").select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!menu) notFound();
  const [{ data: sections }, { data: items }, { data: listings }, { data: variants }] = await Promise.all([
    ctx.db.from("menu_sections").select("id,name,sort").eq("menu_id", id).order("sort").order("name"),
    ctx.db.from("menu_items").select("*").eq("menu_id", id).order("sort").order("name"),
    ctx.db.from("listings").select("id,name").eq("workspace_id", ctx.workspace.id).order("name"),
    ctx.db.from("menu_item_variants").select("id,menu_item_id,name,price_delta_minor,dietary,allergens,may_contain,available").eq("menu_id", id).order("sort").order("name"),
  ]);
  const secs = (sections ?? []) as { id: string; name: string }[], its = (items ?? []) as MenuItem[], vars = (variants ?? []) as MenuVariant[];
  const groups = [...secs.map(s => ({ ...s, items: its.filter(i => i.section_id === s.id) })), { id: "", name: "Other items", items: its.filter(i => !i.section_id) }].filter(g => g.id || g.items.length);
  const dl = (k: string) => DIETARY.find(([x]) => x === k)?.[1] ?? k;
  const undeclared = its.filter(i => i.allergen_status !== "declared").length;
  return <>
    <PageHeader title={(menu as Menu).name} subtitle="Sections, items, variants, dietary tags and allergens." back={{ href: "/provider/menus", label: "Food & drink" }} />
    <div className="mk-page"><div className="mk-grid">
      <div style={{ display: "grid", gap: 16 }}>
        {undeclared > 0 && <p className="mk-note" role="status">{undeclared} item{undeclared === 1 ? " has" : "s have"} no allergen declaration yet. Customers see “allergens not declared” and bookings that include {undeclared === 1 ? "it" : "them"} carry a warning until you confirm.</p>}
        {groups.map(g => <Panel key={g.id || "other"} title={g.name}>
          {g.id && ctx.can.manage && <div className="mk-row" style={{ justifyContent: "flex-end" }}><DeleteRow table="menu_sections" id={g.id} label={`section ${g.name}`} /></div>}
          {!g.items.length ? <p className="mk-empty">No items in this section.</p> : <ul className="mk-list">{g.items.map(i => { const iv = vars.filter(x => x.menu_item_id === i.id); return <li key={i.id} style={{ display: "grid", gap: 8 }}>
            <div className="mk-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div className="mk-main"><b>{i.name}{!i.available && " (unavailable)"}{i.price ? ` · ${money(i.price)}` : ""}{i.course ? ` · ${COURSES.find(([k]) => k === i.course)?.[1] ?? i.course}` : ""}</b>{i.description && <small>{i.description}</small>}
                <small>{i.dietary.map(dl).join(" · ") || "No dietary tags"}{i.allergen_status !== "declared" ? " · Allergens not declared" : i.allergens.length ? ` · Contains: ${i.allergens.join(", ")}` : " · Contains none of the 14 allergens"}
                  {(i.may_contain ?? []).length ? ` · May contain: ${(i.may_contain ?? []).join(", ")}` : ""}{i.allergen_note ? ` · ${i.allergen_note}` : ""}</small>
                {i.allergen_status === "declared" && i.allergen_declared_at && <small>Declared {new Date(i.allergen_declared_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>}</div>
              {ctx.can.manage && <span className="mk-row"><EditItem menuId={id} sections={secs} item={i} /><DeleteRow table="menu_items" id={i.id} label={i.name} /></span>}</div>
            {(iv.length > 0 || ctx.can.manage) && <details open={iv.length > 0}><summary className="mk-link">Variants ({iv.length})</summary><VariantEditor menuId={id} itemId={i.id} variants={iv} canManage={ctx.can.manage} /></details>}
          </li>; })}</ul>}
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
