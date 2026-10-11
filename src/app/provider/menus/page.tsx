import Link from "next/link";
import { getProvider } from "@/lib/provider/context";
import { PageHeader, Panel } from "@/components/workspace/kit";
import { NewMenu, NewBar, EditBar, type BarPackage } from "@/components/venue/menus-client";
import { money } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Food & drink" };

/** Menus and bar packages (§63, §65): real event commerce that customers build from, not free-text notes. */
export default async function ProviderMenusPage() {
  const ctx = await getProvider();
  const [{ data: menus }, { data: bars }, { data: listings }, { data: rules }] = await Promise.all([
    ctx.db.from("menus").select("id,name,kind,pricing,price,status,min_guests,max_guests,serving_style").eq("workspace_id", ctx.workspace.id).order("updated_at", { ascending: false }),
    ctx.db.from("bar_packages").select("*").eq("workspace_id", ctx.workspace.id).order("updated_at", { ascending: false }),
    ctx.db.from("listings").select("id,name").eq("workspace_id", ctx.workspace.id).order("name"),
    ctx.db.from("bar_jurisdiction_rules").select("id,country,region,min_age").eq("active", true).order("country"),
  ]);
  const ruleOpts = (rules ?? []).map((r: { id: string; country: string; region: string | null; min_age: number }) => ({ id: r.id, label: `${r.region ?? r.country} (${r.min_age}+)`, min_age: r.min_age }));
  const tag = (s: string) => <span className={`mk-tag ${s === "published" ? "green" : s === "draft" ? "orange" : "grey"}`}>{s[0]!.toUpperCase() + s.slice(1)}</span>;
  return <>
    <PageHeader title="Food & drink" subtitle="Menus with allergen and dietary information, and bar packages customers can build into their events." />
    <div className="mk-page" style={{ maxWidth: "none" }}>
      <Panel title="Menus">
        {ctx.can.manage && <NewMenu workspaceId={ctx.workspace.id} listings={listings ?? []} />}
        {!(menus ?? []).length ? <p className="mk-empty">No menus yet.</p> : <ul className="mk-list">{(menus ?? []).map((m: { id: string; name: string; kind: string; pricing: string; price: number | null; status: string; min_guests: number | null; max_guests: number | null }) => <li key={m.id}>
          <div className="mk-main"><b><Link className="mk-link" href={`/provider/menus/${m.id}`}>{m.name}</Link></b>
            <small>{m.kind === "drink" ? "Drinks" : m.kind === "mixed" ? "Food & drink" : "Food"} · {m.pricing === "per_person" ? `${money(m.price)} per person` : m.pricing === "fixed" ? `${money(m.price)} package` : "Priced by quantity"}{m.min_guests ? ` · ${m.min_guests}–${m.max_guests ?? "∞"} guests` : ""}</small></div>
          {tag(m.status)}
        </li>)}</ul>}
      </Panel>
      <Panel title="Bar packages">
        {ctx.can.manage && <NewBar workspaceId={ctx.workspace.id} listings={listings ?? []} rules={ruleOpts} />}
        {!(bars ?? []).length ? <p className="mk-empty">No bar packages yet.</p> : <ul className="mk-list">{(bars as BarPackage[]).map(b => <li key={b.id}>
          <div className="mk-main"><b>{b.name}</b><small>{b.model.replace(/_/g, " ")}{b.min_spend ? ` · min spend ${money(b.min_spend)}` : ""}{b.per_person ? ` · ${money(b.per_person)} pp` : ""}{b.hours_from ? ` · ${b.hours_from.slice(0, 5)}–${b.hours_to?.slice(0, 5) ?? ""}` : ""}</small>
            <small>Licence: {b.licensing.provided_by ?? "—"}{b.licensing.licence_ref ? ` (${b.licensing.licence_ref})` : ""} · {b.licensing.min_age ?? 18}+</small></div>
          <span className="mk-row">{tag(b.status)}{ctx.can.manage && <EditBar workspaceId={ctx.workspace.id} listings={listings ?? []} rules={ruleOpts} pkg={b} />}</span>
        </li>)}</ul>}
      </Panel>
    </div>
  </>;
}
