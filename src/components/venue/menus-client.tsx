"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { DIETARY, ALLERGENS, COURSES } from "./menu-constants";
import { saveMenu, saveMenuSection, saveMenuItem, deleteMenuRow, saveBarPackage, saveMenuVariant, deleteMenuVariant } from "@/lib/venue/actions";

const STYLES: [string, string][] = [["plated", "Plated"], ["buffet", "Buffet"], ["sharing", "Sharing"], ["canapes", "Canapés"], ["bowl_food", "Bowl food"], ["street_food", "Street food"], ["family_style", "Family style"], ["drinks_reception", "Drinks reception"], ["self_service", "Self service"]];
const BAR: [string, string][] = [["cash_bar", "Cash bar"], ["hosted_bar", "Hosted bar"], ["open_bar", "Open bar"], ["drink_tokens", "Drink tokens"], ["prepaid_package", "Prepaid package"], ["minimum_spend", "Minimum spend"],
  ["consumption_tab", "Consumption tab"], ["dry_hire", "Dry hire"], ["mobile_bar", "Mobile bar"], ["bartenders_only", "Bartenders only"]];

function useSave() {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (d: unknown) => void) => start(async () => { setError(""); const r = await fn(); if (!r.ok) setError(r.error ?? "Error"); else { after?.(r.data); router.refresh(); } });
  return { pending, error, run };
}
const Save = ({ pending, children = "Save" }: { pending: boolean; children?: ReactNode }) => <button className="mk-btn primary" disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}{children}</button>;
const v = (x: unknown) => (x == null ? "" : String(x));

export type Menu = { id: string; listing_id: string | null; name: string; kind: string; description: string; serving_style: string | null; pricing: string; price: number | null; min_guests: number | null;
  max_guests: number | null; service_window_minutes: number | null; prep_requirements: string; final_numbers_days: number; status: string };
export function MenuForm({ workspaceId, listings, menu, onDone }: { workspaceId: string; listings: { id: string; name: string }[]; menu?: Menu; onDone?: (id: string) => void }) {
  const { pending, error, run } = useSave();
  return <form className="mk-form" aria-label={menu ? `Edit ${menu.name}` : "New menu"} action={f => { const g = (k: string) => String(f.get(k) ?? ""); run(() => saveMenu({ id: menu?.id, workspaceId, listingId: g("listing"), name: g("name"), kind: g("kind"),
    description: g("description"), servingStyle: g("style"), pricing: g("pricing"), price: g("price"), minGuests: g("min"), maxGuests: g("max"), serviceWindow: g("window"), prep: g("prep"), finalDays: g("final"), status: g("status") }), d => onDone?.(String(d))); }}>
    <label className="mk-field"><span>Menu name</span><input name="name" required minLength={2} maxLength={100} defaultValue={menu?.name} /></label>
    <label className="mk-field"><span>Listing</span><select name="listing" defaultValue={menu?.listing_id ?? listings[0]?.id ?? ""}><option value="">All listings</option>{listings.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <label className="mk-field"><span>Type</span><select name="kind" defaultValue={menu?.kind ?? "food"}><option value="food">Food</option><option value="drink">Drink</option><option value="mixed">Food &amp; drink</option></select></label>
    <label className="mk-field"><span>Serving style</span><select name="style" defaultValue={menu?.serving_style ?? ""}><option value="">—</option>{STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label className="mk-field"><span>Pricing</span><select name="pricing" defaultValue={menu?.pricing ?? "per_person"}><option value="per_person">Per person</option><option value="fixed">Fixed package</option><option value="quantity">By quantity</option></select></label>
    <label className="mk-field"><span>Price (£)</span><input name="price" type="number" min={0} step="0.01" defaultValue={v(menu?.price)} /></label>
    <label className="mk-field"><span>Minimum guests</span><input name="min" type="number" min={1} defaultValue={v(menu?.min_guests)} /></label>
    <label className="mk-field"><span>Maximum guests</span><input name="max" type="number" min={1} defaultValue={v(menu?.max_guests)} /></label>
    <label className="mk-field"><span>Service window (minutes)</span><input name="window" type="number" min={0} max={1440} defaultValue={v(menu?.service_window_minutes)} /></label>
    <label className="mk-field"><span>Final numbers due (days before)</span><input name="final" type="number" min={0} max={90} defaultValue={v(menu?.final_numbers_days ?? 7)} /></label>
    <label className="mk-field wide"><span>Description</span><textarea name="description" rows={2} maxLength={2000} defaultValue={menu?.description} /></label>
    <label className="mk-field wide"><span>Preparation requirements</span><input name="prep" maxLength={1000} defaultValue={menu?.prep_requirements} placeholder="e.g. Kitchen access from 14:00, 2 × 13A sockets" /></label>
    <label className="mk-field"><span>Status</span><select name="status" defaultValue={menu?.status ?? "draft"}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
    <div className="mk-row wide"><Save pending={pending}>{menu ? "Save menu" : "Create menu"}</Save></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

export function SectionForm({ menuId }: { menuId: string }) {
  const { pending, error, run } = useSave(); const [name, setName] = useState("");
  return <form className="mk-row" action={() => run(() => saveMenuSection(menuId, name), () => setName(""))} aria-label="Add section">
    <label className="mk-field" style={{ flex: 1 }}><span>New section</span><input value={name} onChange={e => setName(e.target.value)} required maxLength={80} placeholder="e.g. Starters" /></label>
    <Save pending={pending}>Add section</Save>{error && <p className="mk-error">{error}</p>}
  </form>;
}

export type MenuItem = { id: string; section_id: string | null; name: string; description: string; price: number | null; unit: string; dietary: string[]; allergens: string[]; allergen_note: string; available: boolean;
  may_contain?: string[]; allergen_status?: string; course?: string | null; allergen_declared_at?: string | null };
export type MenuVariant = { id: string; menu_item_id: string; name: string; price_delta_minor: number; dietary: string[]; allergens: string[]; may_contain: string[]; available: boolean };
const cap = (a: string) => a[0]!.toUpperCase() + a.slice(1);
export function ItemForm({ menuId, sections, item, onDone }: { menuId: string; sections: { id: string; name: string }[]; item?: MenuItem; onDone?: () => void }) {
  const { pending, error, run } = useSave();
  return <form className="mk-form" aria-label={item ? `Edit ${item.name}` : "New item"} action={f => { const g = (k: string) => String(f.get(k) ?? ""); run(() => saveMenuItem({ id: item?.id, menuId, sectionId: g("section"), name: g("name"),
    description: g("description"), price: g("price"), unit: g("unit"), dietary: f.getAll("dietary").map(String), allergens: f.getAll("allergens").map(String), allergenNote: g("note"), available: f.get("available") === "on",
    mayContain: f.getAll("may_contain").map(String), declared: f.get("declared") === "on", course: g("course") }), () => onDone?.()); }}>
    <label className="mk-field"><span>Item</span><input name="name" required maxLength={120} defaultValue={item?.name} /></label>
    <label className="mk-field"><span>Section</span><select name="section" defaultValue={item?.section_id ?? sections[0]?.id ?? ""}><option value="">No section</option>{sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="mk-field"><span>Price or supplement (£, optional)</span><input name="price" type="number" min={0} step="0.01" defaultValue={v(item?.price)} /></label>
    <label className="mk-field"><span>Unit</span><input name="unit" maxLength={20} defaultValue={item?.unit ?? "portion"} /></label>
    <label className="mk-field"><span>Course</span><select name="course" defaultValue={item?.course ?? ""}><option value="">Not set</option>{COURSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label className="mk-field wide"><span>Description</span><input name="description" maxLength={600} defaultValue={item?.description} /></label>
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Dietary</legend><div className="mk-cats">{DIETARY.map(([k, l]) => <label key={k}><input type="checkbox" name="dietary" value={k} defaultChecked={item?.dietary.includes(k)} />{l}</label>)}</div></fieldset>
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Contains (14 major allergens)</legend><div className="mk-cats">{ALLERGENS.map(a => <label key={a}><input type="checkbox" name="allergens" value={a} defaultChecked={item?.allergens.includes(a)} />{a[0]!.toUpperCase() + a.slice(1)}</label>)}</div></fieldset>
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>May contain (cross-contamination risk)</legend><div className="mk-cats">{ALLERGENS.map(a => <label key={a}><input type="checkbox" name="may_contain" value={a} defaultChecked={item?.may_contain?.includes(a)} />{cap(a)}</label>)}</div></fieldset>
    <label className="mk-switch wide"><input type="checkbox" name="declared" defaultChecked={item?.allergen_status === "declared"} />I’ve checked this item: the allergens above are complete (none ticked = contains none of the 14)</label>
    <label className="mk-field wide"><span>Allergen note (e.g. “fried in shared oil”)</span><input name="note" maxLength={300} defaultValue={item?.allergen_note} /></label>
    <label className="mk-switch"><input type="checkbox" name="available" defaultChecked={item?.available ?? true} />Available</label>
    <p className="mk-note wide">You’re responsible for this allergen information. Gala Dock shows it as your declaration and never as a safety guarantee.</p>
    <div className="mk-row wide">{onDone && <button type="button" className="mk-btn ghost" onClick={onDone}>Cancel</button>}<Save pending={pending}>{item ? "Save item" : "Add item"}</Save></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}

export function DeleteRow({ table, id, label }: { table: "menu_items" | "menu_sections"; id: string; label: string }) {
  const { pending, run } = useSave();
  return <button type="button" className="mk-btn danger" aria-label={`Delete ${label}`} disabled={pending} onClick={() => run(() => deleteMenuRow(table, id))}><Trash2 size={14} aria-hidden="true" /></button>;
}
export function EditItem({ menuId, sections, item }: { menuId: string; sections: { id: string; name: string }[]; item: MenuItem }) {
  const [open, setOpen] = useState(false);
  return open ? <ItemForm menuId={menuId} sections={sections} item={item} onDone={() => setOpen(false)} /> : <button type="button" className="mk-btn ghost" onClick={() => setOpen(true)}>Edit</button>;
}

export type BarPackage = { id: string; listing_id: string | null; name: string; model: string; description: string; price: number | null; per_person: number | null; token_price: number | null; min_spend: number | null;
  corkage_per_bottle: number | null; glassware: boolean; hours_from: string | null; hours_to: string | null; staffing: string; setup_minutes: number; deposit_pct: number;
  licensing: { provided_by?: string; licence_ref?: string; jurisdiction_rule_id?: string; min_age?: number }; status: string };
export function BarPackageForm({ workspaceId, listings, rules, pkg, onDone }: { workspaceId: string; listings: { id: string; name: string }[]; rules: { id: string; label: string; min_age: number }[]; pkg?: BarPackage; onDone?: () => void }) {
  const { pending, error, run } = useSave(); const l = pkg?.licensing ?? {};
  return <form className="mk-form" aria-label={pkg ? `Edit ${pkg.name}` : "New bar package"} action={f => { const g = (k: string) => String(f.get(k) ?? ""); run(() => saveBarPackage({ id: pkg?.id, workspaceId, listingId: g("listing"), name: g("name"), model: g("model"),
    description: g("description"), price: g("price"), perPerson: g("per_person"), tokenPrice: g("token"), minSpend: g("min_spend"), corkage: g("corkage"), glassware: f.get("glassware") === "on", hoursFrom: g("from"), hoursTo: g("to"),
    staffing: g("staffing"), setupMinutes: g("setup"), depositPct: g("deposit"), licenceProvidedBy: g("provided_by"), licenceRef: g("licence_ref"), ruleId: g("rule"), minAge: g("min_age"), status: g("status") }), () => onDone?.()); }}>
    <label className="mk-field"><span>Package name</span><input name="name" required minLength={2} maxLength={100} defaultValue={pkg?.name} /></label>
    <label className="mk-field"><span>Bar model</span><select name="model" defaultValue={pkg?.model ?? "cash_bar"}>{BAR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
    <label className="mk-field"><span>Listing</span><select name="listing" defaultValue={pkg?.listing_id ?? listings[0]?.id ?? ""}><option value="">All listings</option>{listings.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className="mk-field"><span>Package price (£)</span><input name="price" type="number" min={0} step="0.01" defaultValue={v(pkg?.price)} /></label>
    <label className="mk-field"><span>Per person (£)</span><input name="per_person" type="number" min={0} step="0.01" defaultValue={v(pkg?.per_person)} /></label>
    <label className="mk-field"><span>Drink token price (£)</span><input name="token" type="number" min={0} step="0.01" defaultValue={v(pkg?.token_price)} /></label>
    <label className="mk-field"><span>Minimum spend (£)</span><input name="min_spend" type="number" min={0} step="1" defaultValue={v(pkg?.min_spend)} /></label>
    <label className="mk-field"><span>Corkage per bottle (£)</span><input name="corkage" type="number" min={0} step="0.01" defaultValue={v(pkg?.corkage_per_bottle)} /></label>
    <label className="mk-field"><span>Bar opens</span><input name="from" type="time" defaultValue={pkg?.hours_from?.slice(0, 5) ?? ""} /></label>
    <label className="mk-field"><span>Last orders</span><input name="to" type="time" defaultValue={pkg?.hours_to?.slice(0, 5) ?? ""} /></label>
    <label className="mk-field"><span>Setup (minutes)</span><input name="setup" type="number" min={0} max={600} defaultValue={v(pkg?.setup_minutes ?? 60)} /></label>
    <label className="mk-field"><span>Deposit (%)</span><input name="deposit" type="number" min={0} max={100} defaultValue={v(pkg?.deposit_pct ?? 30)} /></label>
    <label className="mk-field wide"><span>Staffing</span><input name="staffing" maxLength={500} defaultValue={pkg?.staffing} placeholder="e.g. 1 bartender per 50 guests" /></label>
    <label className="mk-field"><span>Licensing rules</span><select name="rule" defaultValue={l.jurisdiction_rule_id ?? rules[0]?.id ?? ""}>{rules.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    <label className="mk-field"><span>Licence held by</span><select name="provided_by" defaultValue={l.provided_by ?? "bar"}><option value="bar">Us (the bar)</option><option value="venue">The venue</option><option value="client">The client (e.g. TEN)</option></select></label>
    <label className="mk-field"><span>Licence reference</span><input name="licence_ref" maxLength={60} defaultValue={l.licence_ref ?? ""} /></label>
    <label className="mk-field"><span>Minimum age</span><input name="min_age" type="number" min={0} max={25} defaultValue={v(l.min_age ?? rules[0]?.min_age ?? 18)} /></label>
    <label className="mk-switch"><input type="checkbox" name="glassware" defaultChecked={pkg?.glassware ?? false} />Glassware included</label>
    <label className="mk-field wide"><span>Description</span><textarea name="description" rows={2} maxLength={2000} defaultValue={pkg?.description} /></label>
    <label className="mk-field"><span>Status</span><select name="status" defaultValue={pkg?.status ?? "draft"}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
    <div className="mk-row wide">{onDone && <button type="button" className="mk-btn ghost" onClick={onDone}>Cancel</button>}<Save pending={pending}>{pkg ? "Save package" : "Add bar package"}</Save></div>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </form>;
}
export function EditBar(props: { workspaceId: string; listings: { id: string; name: string }[]; rules: { id: string; label: string; min_age: number }[]; pkg: BarPackage }) {
  const [open, setOpen] = useState(false);
  return open ? <BarPackageForm {...props} onDone={() => setOpen(false)} /> : <button type="button" className="mk-btn ghost" onClick={() => setOpen(true)}>Edit</button>;
}
export function NewMenu({ workspaceId, listings }: { workspaceId: string; listings: { id: string; name: string }[] }) {
  const router = useRouter(); const [open, setOpen] = useState(false);
  return open ? <MenuForm workspaceId={workspaceId} listings={listings} onDone={id => router.push(`/provider/menus/${id}`)} /> : <button type="button" className="mk-btn primary" onClick={() => setOpen(true)}>New menu</button>;
}
export function NewBar(props: { workspaceId: string; listings: { id: string; name: string }[]; rules: { id: string; label: string; min_age: number }[] }) {
  const [open, setOpen] = useState(false);
  return open ? <BarPackageForm {...props} onDone={() => setOpen(false)} /> : <button type="button" className="mk-btn primary" onClick={() => setOpen(true)}>New bar package</button>;
}

/** Item variants (Q13 menu_item_variants): name, price difference and the variant's own dietary/allergen declaration. */
export function VariantEditor({ menuId, itemId, variants, canManage }: { menuId: string; itemId: string; variants: MenuVariant[]; canManage: boolean }) {
  const { pending, error, run } = useSave();
  const [open, setOpen] = useState<string | null>(null);
  const form = (x?: MenuVariant) => <form className="mk-form" aria-label={x ? `Edit variant ${x.name}` : "New variant"} action={f => { const g = (k: string) => String(f.get(k) ?? "");
    run(() => saveMenuVariant({ id: x?.id, menuId, itemId, name: g("name"), priceDelta: g("delta"), dietary: f.getAll("dietary").map(String), allergens: f.getAll("allergens").map(String), mayContain: f.getAll("may_contain").map(String), available: f.get("available") === "on" }), () => setOpen(null)); }}>
    <label className="mk-field"><span>Variant</span><input name="name" required maxLength={80} defaultValue={x?.name} placeholder="e.g. Vegan, Large, Gluten-free bun" /></label>
    <label className="mk-field"><span>Price difference (£)</span><input name="delta" type="number" step="0.01" defaultValue={x ? (x.price_delta_minor / 100).toFixed(2) : "0.00"} /></label>
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Dietary</legend><div className="mk-cats">{DIETARY.map(([k, l]) => <label key={k}><input type="checkbox" name="dietary" value={k} defaultChecked={x?.dietary.includes(k)} />{l}</label>)}</div></fieldset>
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Contains</legend><div className="mk-cats">{ALLERGENS.map(a => <label key={a}><input type="checkbox" name="allergens" value={a} defaultChecked={x?.allergens.includes(a)} />{cap(a)}</label>)}</div></fieldset>
    <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>May contain</legend><div className="mk-cats">{ALLERGENS.map(a => <label key={a}><input type="checkbox" name="may_contain" value={a} defaultChecked={x?.may_contain.includes(a)} />{cap(a)}</label>)}</div></fieldset>
    <label className="mk-switch"><input type="checkbox" name="available" defaultChecked={x?.available ?? true} />Available</label>
    <div className="mk-row wide"><button type="button" className="mk-btn ghost" onClick={() => setOpen(null)}>Cancel</button><Save pending={pending}>{x ? "Save variant" : "Add variant"}</Save></div>
    {error && <p className="mk-error" role="alert">{error}</p>}</form>;
  return <div className="mk-variants">
    {variants.length > 0 && <ul className="mk-list">{variants.map(x => <li key={x.id}>{open === x.id ? form(x) : <>
      <div className="mk-main"><b>{x.name}{!x.available && " (unavailable)"} · {x.price_delta_minor === 0 ? "same price" : `${x.price_delta_minor > 0 ? "+" : "−"}£${(Math.abs(x.price_delta_minor) / 100).toFixed(2)}`}</b>
        <small>{x.dietary.map(d => DIETARY.find(([k]) => k === d)?.[1] ?? d).join(" · ") || "No dietary tags"}{x.allergens.length ? ` · Contains: ${x.allergens.join(", ")}` : ""}{x.may_contain.length ? ` · May contain: ${x.may_contain.join(", ")}` : ""}</small></div>
      {canManage && <span className="mk-row"><button type="button" className="mk-btn ghost" onClick={() => setOpen(x.id)}>Edit</button>
        <button type="button" className="mk-btn danger" aria-label={`Delete variant ${x.name}`} disabled={pending} onClick={() => run(() => deleteMenuVariant(x.id))}><Trash2 size={14} aria-hidden="true" /></button></span>}</>}</li>)}</ul>}
    {canManage && (open === "new" ? form() : <button type="button" className="mk-btn ghost" aria-label="Add a variant" onClick={() => setOpen("new")}>Add variant</button>)}
  </div>;
}
