"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveCatering, priceCatering } from "@/lib/venue/actions";
import { DIETARY } from "./menus-client";

type Item = { id: string; section_id: string | null; name: string; description: string; price: number | null; dietary: string[]; allergens: string[]; allergen_note: string };
export type CMenu = { id: string; name: string; description: string; serving_style: string | null; pricing: string; price: number | null; min_guests: number | null; max_guests: number | null;
  final_numbers_days: number; sections: { id: string; name: string }[]; items: Item[] };
type Selection = { menu_id: string; guest_count: number; items: { item_id: string; qty?: number }[]; dietary_counts: Record<string, number>; serving_style: string | null; service_at: string | null;
  staffing: string; equipment: string; notes: string; status: string; final_numbers_due: string | null };
type Price = { total: number; per_guest: number | null; lines: { label: string; amount: number }[]; warnings: string[]; allergen_disclaimer: string };
const gbp = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

/** Catering event build (§64): menu, guests, dishes, dietary needs, service — priced live on the server; number changes show consequences before saving. */
export function CateringBuilder({ itemId, menus, selection, defaultGuests, eventStart }: { itemId: string; menus: CMenu[]; selection: Selection | null; defaultGuests: number; eventStart: string | null }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [menuId, setMenuId] = useState(selection?.menu_id ?? menus[0]?.id ?? "");
  const [guests, setGuests] = useState(selection?.guest_count ?? defaultGuests);
  const [picked, setPicked] = useState<Record<string, number>>(Object.fromEntries((selection?.items ?? []).map(i => [i.item_id, i.qty ?? 0])));
  const [diet, setDiet] = useState<Record<string, number>>(selection?.dietary_counts ?? {});
  const [price, setPrice] = useState<Price | null>(null);
  const [confirm, setConfirm] = useState<{ previous_total: number; new_total: number; difference: number; after_deadline: boolean } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const menu = menus.find(m => m.id === menuId);
  const items = useMemo(() => Object.entries(picked).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty })), [picked]);
  useEffect(() => {
    if (!menuId || guests < 1) return;
    let live = true;
    const t = setTimeout(() => priceCatering(menuId, guests, items).then(r => { if (live && r.ok && r.data) setPrice(r.data); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [menuId, guests, items]);
  if (!menus.length) return <p className="mk-empty">This provider hasn’t published a menu yet. Ask them for one in your messages.</p>;
  const locked = selection?.status === "locked";
  const local = (iso: string | null) => iso ? new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "";
  const save = (f: FormData, submit: boolean, accept = false) => start(async () => {
    setMsg(null);
    const r = await saveCatering({ itemId, menuId, guests, items, dietary: diet, style: String(f.get("style") ?? ""), serviceAt: String(f.get("service_at") ?? ""), staffing: String(f.get("staffing") ?? ""),
      equipment: String(f.get("equipment") ?? ""), notes: String(f.get("notes") ?? ""), submit, acceptChange: accept });
    if (!r.ok) { setMsg({ ok: false, t: r.error }); return; }
    const d = r.data as { needs_confirmation?: boolean; previous_total: number; new_total: number; difference: number; after_deadline: boolean };
    if (d?.needs_confirmation) { setConfirm(d); return; }
    setConfirm(null); setMsg({ ok: true, t: submit ? "Sent to the caterer." : "Saved." }); router.refresh();
  });
  return <form className="mk-form" aria-label="Catering" onSubmit={e => { e.preventDefault(); const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; save(new FormData(e.currentTarget), sub?.value === "submit", sub?.value === "accept"); }}>
    <fieldset disabled={locked} style={{ display: "contents" }}>
      <label className="mk-field"><span>Menu</span><select value={menuId} onChange={e => { setMenuId(e.target.value); setPicked({}); }}>{menus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="mk-field"><span>Guests</span><input type="number" min={1} max={100000} value={guests} onChange={e => setGuests(Math.max(1, Number(e.target.value) || 1))} /></label>
      {menu && <p className="mk-note wide">{menu.description}{menu.min_guests ? ` Minimum ${menu.min_guests} guests.` : ""}{menu.max_guests ? ` Maximum ${menu.max_guests}.` : ""} Final numbers are due {menu.final_numbers_days} days before the event.</p>}
      {menu && [...menu.sections, { id: "", name: "Other" }].map(sec => { const its = menu.items.filter(i => (i.section_id ?? "") === sec.id); return its.length ? <fieldset key={sec.id || "other"} className="mk-field wide" style={{ border: 0, padding: 0 }}>
        <legend>{sec.name}</legend>
        <ul className="mk-list">{its.map(i => <li key={i.id}><div className="mk-main"><b>{i.name}{i.price ? ` · ${gbp(i.price)}` : ""}</b>{i.description && <small>{i.description}</small>}
          <small>{i.dietary.map(d => DIETARY.find(([k]) => k === d)?.[1] ?? d).join(" · ")}{i.allergens.length ? ` · Contains: ${i.allergens.join(", ")}` : ""}{i.allergen_note ? ` · ${i.allergen_note}` : ""}</small></div>
          {(menu.pricing === "quantity" || i.price) ? <label className="mk-field" style={{ width: 110 }}><span>Quantity</span><input type="number" min={0} value={picked[i.id] ?? 0} onChange={e => setPicked(p => ({ ...p, [i.id]: Math.max(0, Number(e.target.value) || 0) }))} /></label> : <span className="mk-tag grey">Included</span>}
        </li>)}</ul></fieldset> : null; })}
      <fieldset className="mk-field wide" style={{ border: 0, padding: 0 }}><legend>Dietary requirements (number of guests)</legend>
        <div className="mk-form" style={{ border: 0, padding: 0, background: "none", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))" }}>{DIETARY.map(([k, l]) => <label key={k} className="mk-field"><span>{l}</span>
          <input type="number" min={0} max={guests} value={diet[k] ?? 0} onChange={e => setDiet(d => ({ ...d, [k]: Math.max(0, Number(e.target.value) || 0) }))} /></label>)}</div></fieldset>
      <label className="mk-field"><span>Serving style</span><input name="style" defaultValue={selection?.serving_style ?? menu?.serving_style ?? ""} maxLength={40} /></label>
      <label className="mk-field"><span>Service time</span><input name="service_at" type="datetime-local" defaultValue={local(selection?.service_at ?? eventStart)} /></label>
      <label className="mk-field"><span>Staffing</span><input name="staffing" maxLength={1000} defaultValue={selection?.staffing} placeholder="e.g. 1 server per 10 guests" /></label>
      <label className="mk-field"><span>Equipment</span><input name="equipment" maxLength={1000} defaultValue={selection?.equipment} placeholder="e.g. Crockery hire, chafing dishes" /></label>
      <label className="mk-field wide"><span>Notes for the caterer</span><textarea name="notes" rows={2} maxLength={2000} defaultValue={selection?.notes} /></label>
    </fieldset>
    <div className="mk-quote wide" aria-live="polite">
      {price ? <>
        <dl className="mk-dl">{price.lines.map(l => <div key={l.label}><dt>{l.label}</dt><dd>{gbp(l.amount)}</dd></div>)}<div><dt>Total</dt><dd>{gbp(price.total)}</dd></div><div><dt>Per guest</dt><dd>{gbp(price.per_guest)}</dd></div></dl>
        {price.warnings.map(w => <p key={w} className="mk-note warn">{w}</p>)}
        <p className="mk-note">{price.allergen_disclaimer}</p>
      </> : <p className="mk-note"><Loader2 size={13} className="mk-spin" aria-hidden="true" /> Pricing…</p>}
    </div>
    {confirm && <div className="mk-inline wide" role="alertdialog" aria-label="Confirm change">
      <p className="mk-note warn">This changes your confirmed catering from {gbp(confirm.previous_total)} to {gbp(confirm.new_total)} ({confirm.difference >= 0 ? "+" : ""}{gbp(confirm.difference)}).{confirm.after_deadline ? " The final-numbers deadline has passed, so the caterer may not be able to accept a reduction." : ""}</p>
      <div className="mk-row"><button type="button" className="mk-btn ghost" onClick={() => setConfirm(null)}>Keep current numbers</button><button className="mk-btn primary" value="accept" disabled={pending}>Accept and update</button></div>
    </div>}
    {locked ? <p className="mk-note wide">Final numbers are locked. Contact the caterer to change anything.</p> :
      <div className="mk-row wide"><button className="mk-btn ghost" value="save" disabled={pending}>Save</button><button className="mk-btn primary" value="submit" disabled={pending}>{pending && <Loader2 size={14} className="mk-spin" aria-hidden="true" />}Send to caterer</button></div>}
    {msg && <p role="status" className={msg.ok ? "mk-note" : "mk-error"}>{msg.t}</p>}
  </form>;
}
