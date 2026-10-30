"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, LayoutTemplate, GripVertical, MoreHorizontal, Copy, Trash2, ArrowUp, ArrowDown, Tag, CalendarDays, Info, Sparkles, ListChecks, CalendarRange, Calculator, ShieldAlert, Megaphone, CheckCircle2, Clock, CircleDot, EyeOff, Image as ImageIcon, X } from "lucide-react";
import { Menu, Toggle, useAction, useKitToast } from "@/components/kit/client";
import { saveProTiers } from "@/lib/actions/ticket-pro";
import { createPromoter } from "@/lib/actions/promotion";
import { TIER_KINDS, type ProPhase, type ProSettings } from "@/lib/ticket-pro-model";
import type { ProSetup } from "@/lib/data/ticket-pro";
import { Card, Footer, gbp, num, pct, dt, toLocal, fromLocal, uid } from "./ui";

type T = { id?: string; name: string; description: string; kind: string; price: number; quantity: number; sold: number; sale_start: string | null; sale_end: string | null; release: string; enabled: boolean; image: string | null; order_limit: number; badge: string | null; color: string; status: string; valid_from: string | null; valid_to: string | null };
type Promo = ProSetup["promos"][number];
const STOCK = ["early", "general", "vip", "backstage", "group", "accessible", "comp"].map(k => `/assets/gd/builder/tickets/tier-${k}.webp`);
const KIND_IMG: Record<string, string> = { early: STOCK[0]!, general: STOCK[1]!, vip: STOCK[2]!, group: STOCK[4]!, accessible: STOCK[5]!, comp: STOCK[6]!, student: STOCK[1]!, press: STOCK[6]! };
const GROUPS = [["General", "#2563eb", ["general", "early", "student"]], ["VIP", "#a855f7", ["vip"]], ["Accessible", "#16a46c", ["accessible"]], ["Group", "#f59e0b", ["group"]], ["Other", "#e0398b", ["comp", "press"]]] as const;
const PALETTE = ["#2563eb", "#7c3aed", "#e0398b", "#e08a00", "#16a46c", "#64748b", "#0ea5c6", "#f97316"];
const at = (iso: string | null, days: number, h = 10) => { if (!iso) return null; const d = new Date(Date.parse(iso) - days * 864e5); d.setHours(h, 0, 0, 0); return d.toISOString(); };

export function StepTiers({ data, base }: { data: ProSetup; base: string }) {
  const router = useRouter(); const toast = useKitToast(); const { run, pending } = useAction(); const e = data.event; const p = data.pro; const [now] = useState(() => Date.now());
  const [phases, setPhases] = useState<ProPhase[]>(p.phases);
  const [tiers, setTiers] = useState<T[]>(() => data.tiers.map(t => {
    const ai = t.after_tier ? data.tiers.findIndex(x => x.id === t.after_tier) : -1; const ph = p.phases.find(x => x.name === t.release_name);
    return { id: t.id, name: t.name, description: t.description, kind: t.kind, price: t.price, quantity: t.quantity, sold: t.sold, sale_start: t.sale_start, sale_end: t.sale_end, release: ai >= 0 ? `after:${ai}` : ph ? `phase:${ph.id}` : "open", enabled: !["hidden", "paused"].includes(t.status), image: t.image, order_limit: t.order_limit, badge: t.badge, color: t.color, status: t.status, valid_from: t.valid_from, valid_to: t.valid_to };
  }));
  const [sales, setSales] = useState<ProSettings["sales"]>(p.sales); const [promos, setPromos] = useState<Promo[]>(data.promos);
  const [allocEdits, setAllocEdits] = useState<Record<string, number | null>>({}); const [newPromoter, setNewPromoter] = useState<{ name: string; pct: number } | null>(null);
  const alloc = data.promoters.map(x => x.id in allocEdits ? { ...x, ticket_allocation: allocEdits[x.id]! } : x);
  const set = (i: number, patch: Partial<T>) => setTiers(ts => ts.map((t, k) => k === i ? { ...t, ...patch } : t));
  const capacity = p.capacity; const sellable = Math.floor(capacity * (1 - p.buffer_pct / 100));
  const active = tiers.filter(t => t.enabled); const total = active.reduce((a, t) => a + t.quantity, 0); const revenue = active.reduce((a, t) => a + t.price * t.quantity, 0);
  const evStart = e.starts_at ? Date.parse(e.starts_at) : now + 90 * 864e5;
  const defaults = (kind: string) => ({ sale_start: at(e.starts_at, kind === "early" ? 120 : 90), sale_end: e.starts_at ? new Date(evStart - 60 * 6e4).toISOString() : null });
  const addTier = (seed?: Partial<T>) => setTiers(ts => [...ts, { name: `Tier ${ts.length + 1}`, description: "", kind: "general", price: 25, quantity: Math.max(0, sellable - total), sold: 0, ...defaults("general"), release: "open", enabled: true, image: null, order_limit: sales.order_limit, badge: null, color: PALETTE[ts.length % PALETTE.length]!, status: "draft", valid_from: null, valid_to: null, ...seed }]);

  // Forecast: each tier's value spread across the months its sales window covers.
  const chart = (() => {
    const starts = active.map(t => t.sale_start ? Date.parse(t.sale_start) : now); const first = new Date(Math.min(now, ...starts)); first.setDate(1);
    const months: { key: string; label: string; from: number; to: number }[] = [];
    for (let d = new Date(first); d.getTime() <= evStart && months.length < 8; d.setMonth(d.getMonth() + 1)) { const from = d.getTime(), n = new Date(d); n.setMonth(n.getMonth() + 1); months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }), from, to: n.getTime() }); }
    const rows = months.map(m => ({ ...m, parts: GROUPS.map(([g, c, kinds]) => ({ g, c, v: active.filter(t => (kinds as readonly string[]).includes(t.kind)).reduce((a, t) => {
      const s = t.sale_start ? Date.parse(t.sale_start) : months[0]!.from, en = t.sale_end ? Date.parse(t.sale_end) : evStart; const span = Math.max(1, en - s); const ov = Math.max(0, Math.min(en, m.to) - Math.max(s, m.from)); return a + t.price * t.quantity * ov / span; }, 0) })) }));
    const max = Math.max(1, ...rows.map(r => r.parts.reduce((a, x) => a + x.v, 0)));
    const step = max > 150_000 ? 50_000 : max > 60_000 ? 20_000 : max > 20_000 ? 10_000 : max > 5_000 ? 2_000 : 500; const top = Math.ceil(max / step) * step;
    return { rows, top, step };
  })();
  const timeline = (() => {
    const ev = new Map<string, string[]>(); active.forEach(t => { if (t.release.startsWith("after:")) return; const k = t.sale_start ?? ""; if (k) ev.set(k, [...(ev.get(k) ?? []), t.name]); });
    const list = [...ev].sort((a, b) => a[0].localeCompare(b[0])).map(([d, names], i) => ({ d, label: `${names.length > 2 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names.join(" & ")} on sale`, c: PALETTE[i % PALETTE.length]! }));
    const close = active.map(t => t.sale_end).filter(Boolean).sort().at(-1); if (close) list.push({ d: close, label: "Final sales close", c: "#e11d48" }); return list;
  })();

  const save = async (next: boolean) => {
    const r = await run(() => saveProTiers(e.id, {
      tiers: tiers.map(t => { const ph = t.release.startsWith("phase:") ? phases.find(x => `phase:${x.id}` === t.release) : null; return { id: t.id, name: t.name, description: t.description, kind: t.kind, price: t.price, quantity: t.quantity, sale_start: ph?.starts_at ?? t.sale_start, sale_end: t.sale_end, release_name: ph?.name ?? null, after: t.release.startsWith("after:") ? Number(t.release.slice(6)) : -1, enabled: t.enabled, image: t.image, order_limit: Math.min(t.order_limit, sales.order_limit), badge: t.badge, color: t.color, valid_from: t.valid_from, valid_to: t.valid_to }; }),
      phases, sales, promos: promos.map(({ used: _u, status: _s, ...x }) => x), allocations: alloc.map(a => ({ id: a.id, qty: a.ticket_allocation })),
    }), { refresh: false });
    if (r.ok) router.push(next ? `${base}?step=3` : `/organizer/events/${e.id}?tab=sell`);
  };
  const suggest = () => {
    const secs = p.sections.filter(s => s.type !== "hold");
    const seed: Omit<T, "sold" | "status">[] = secs.length ? [
      ...(secs.some(s => s.type === "standing") ? [{ name: "Early Bird - General Admission", description: "Standard entry to the event", kind: "early", price: 35, quantity: Math.round(secs.filter(s => s.type === "standing").reduce((a, s) => a + s.capacity, 0) * .3 / 10) * 10 }] : []),
      ...secs.map(s => ({ name: s.type === "standing" ? "General Admission" : s.type === "vip" ? `${s.name.replace(/ (Left|Right)$/, "")} Experience` : s.type === "accessible" ? "Accessible Ticket" : s.name, description: s.type === "accessible" ? "For disabled guests + companion" : s.type === "vip" ? "Premium entry with lounge access" : s.type === "reserved" ? "Reserved seat with great views" : "Standard entry to the event", kind: s.type === "standing" ? "general" : s.type === "vip" ? "vip" : s.type === "accessible" ? "accessible" : "general", price: s.type === "vip" ? 120 : s.type === "reserved" ? 75 : 50, quantity: s.capacity })),
    ].map((t, i) => ({ ...t, ...defaults(t.kind), release: "open", enabled: true, valid_from: null, valid_to: null, image: KIND_IMG[t.kind] ?? null, order_limit: sales.order_limit, badge: null, color: PALETTE[i % PALETTE.length]! })) : [];
    if (!seed.length) return toast("Add sections in Model & Capacity first, or add tiers manually.", "error");
    // Early bird is carved out of GA so totals still fit.
    const ga = seed.findIndex(t => t.name === "General Admission"); if (ga >= 0 && seed[0]!.kind === "early") seed[ga]!.quantity -= seed[0]!.quantity;
    const fit = seed.reduce((a, t) => a + t.quantity, 0); const k = fit > sellable ? sellable / fit : 1;
    setTiers([...tiers.filter(t => t.sold > 0), ...seed.map(t => ({ ...t, quantity: Math.floor(t.quantity * k / 10) * 10, sold: 0, status: "draft" }))]); toast(`${seed.length} tiers suggested from your sections`);
  };
  const releasePlan = () => {
    const ph: ProPhase[] = [{ id: uid(), name: "Phase 1 – Early Access", starts_at: at(e.starts_at, 120) }, { id: uid(), name: "Phase 2 – General Sale", starts_at: at(e.starts_at, 90) }, { id: uid(), name: "Phase 3 – Final Release", starts_at: at(e.starts_at, 21) }];
    setPhases(ph); setTiers(ts => ts.map(t => t.release.startsWith("after:") ? t : { ...t, release: `phase:${ph[t.kind === "early" ? 0 : ["comp", "press"].includes(t.kind) ? 0 : /backstage/i.test(t.name) ? 2 : 1]!.id}`, sale_start: ph[t.kind === "early" ? 0 : /backstage/i.test(t.name) ? 2 : 1]!.starts_at }));
    toast("3-phase release plan created");
  };
  const breakEven = () => { const avg = total ? revenue / total : 0; if (!e.budget || !avg) return toast(`Projected revenue ${gbp(revenue)} from ${num(total)} tickets.`); const n = Math.ceil(e.budget / avg); toast(`Projected ${gbp(revenue)}. Break-even at ${num(n)} tickets (${pct(n, total, 0)} of inventory) against your ${gbp(e.budget)} budget.`); };
  const oversell = () => {
    const issues: string[] = []; if (total > sellable) issues.push(`tiers exceed sellable capacity by ${num(total - sellable)}`);
    const pa = alloc.reduce((a, x) => a + (x.ticket_allocation ?? 0), 0); if (pa > total) issues.push("promoter allocations exceed inventory");
    if (tiers.some(t => t.quantity < t.sold)) issues.push("a tier is below its sold count");
    toast(issues.length ? `Oversell risk: ${issues.join("; ")}.` : `No oversell risk — ${num(total)} of ${num(sellable)} sellable tickets allocated.`, issues.length ? "error" : undefined);
  };
  const promoStatus = (x: Promo) => !sales.discount_codes ? "Disabled" : x.valid_until && Date.parse(x.valid_until) < now ? "Expired" : x.valid_from && Date.parse(x.valid_from) > now ? "Scheduled" : "Active";

  return <>
    <div className="tp-g2b">
      <Card title="Ticket tiers" sub="Create ticket types, set prices, quantities and release windows. You can add multiple release phases and dependencies." className="tp-tiers"
        action={<><button className="k-btn outline sm" onClick={suggest}><LayoutTemplate size={14} />Use template</button><button className="k-btn primary sm" onClick={() => addTier()}><Plus size={14} />Add tier</button></>}>
        <div className="tp-tw"><table className="tp-t tp-tt"><thead><tr><th>#</th><th>Ticket name</th><th>Type</th><th>Price (GBP)</th><th>Quantity</th><th>Sales window</th><th>Release rule</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{tiers.map((t, i) => <tr key={t.id ?? `n${i}`} data-off={!t.enabled || undefined}>
            <td><GripVertical size={14} className="tp-grip" /></td>
            <td><span className="tp-tn"><Menu label={`Image for ${t.name}`} width={236} align="left" trigger={({ toggle, open, id }) => <button className="tp-timg" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Change image for ${t.name}`}>{/* eslint-disable-next-line @next/next/no-img-element */}{t.image || KIND_IMG[t.kind] ? <img src={t.image || KIND_IMG[t.kind]} alt="" /> : <ImageIcon size={16} />}</button>}>{close => <div className="tp-imgs">{[...data.gallery, ...STOCK].map(src => <button key={src} aria-label="Use image" onClick={() => { set(i, { image: src }); close(); }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src} alt="" /></button>)}</div>}</Menu>
              <span><input className="tp-bare b" aria-label="Ticket name" value={t.name} maxLength={60} onChange={x => set(i, { name: x.target.value })} /><input className="tp-bare s" aria-label={`${t.name} description`} placeholder="Short description" value={t.description} maxLength={200} onChange={x => set(i, { description: x.target.value })} /></span></span></td>
            <td><select className={`tp-kind k-${t.kind}`} aria-label={`${t.name} type`} value={t.kind} onChange={x => set(i, { kind: x.target.value })}>{Object.entries(TIER_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
            <td><span className="tp-in sm money"><i>£</i><input inputMode="decimal" aria-label={`${t.name} price`} value={t.price.toFixed(2)} onChange={x => set(i, { price: Math.max(0, Number(x.target.value.replace(/[^0-9.]/g, "")) || 0) })} /></span></td>
            <td><span className="tp-in sm"><input inputMode="numeric" aria-label={`${t.name} quantity`} value={t.quantity} onChange={x => set(i, { quantity: Math.max(t.sold, Number(x.target.value.replace(/\D/g, "")) || 0) })} /></span>{t.sold > 0 && <small className="tp-sold">{num(t.sold)} sold</small>}</td>
            <td><Menu label={`Sales window for ${t.name}`} width={250} trigger={({ toggle, open, id }) => <button className="tp-win" onClick={toggle} aria-expanded={open} aria-controls={id}>{t.release.startsWith("after:") ? <span>When {tiers[Number(t.release.slice(6))]?.name ?? "previous tier"} sells out</span> : <><span>{dt(t.release.startsWith("phase:") ? phases.find(x => `phase:${x.id}` === t.release)?.starts_at ?? t.sale_start : t.sale_start)}</span><small>→ {dt(t.sale_end)}</small></>}</button>}>
              <div className="tp-winf"><label>Sale starts<input type="datetime-local" value={toLocal(t.sale_start)} disabled={!t.release.startsWith("open") && !t.release.startsWith("after")} onChange={x => set(i, { sale_start: fromLocal(x.target.value) })} /></label><label>Sale ends<input type="datetime-local" value={toLocal(t.sale_end)} onChange={x => set(i, { sale_end: fromLocal(x.target.value) })} /></label>{t.release.startsWith("phase:") && <small>Start date follows the release phase.</small>}
                <b className="tp-winh">Valid for entry (optional)</b><small>For day or session tickets — the scanner rejects this ticket outside these times.</small>
                <label>Entry from<input type="datetime-local" value={toLocal(t.valid_from)} onChange={x => set(i, { valid_from: fromLocal(x.target.value) })} /></label><label>Entry until<input type="datetime-local" value={toLocal(t.valid_to)} onChange={x => set(i, { valid_to: fromLocal(x.target.value) })} /></label></div></Menu>{(t.valid_from || t.valid_to) && <small className="tp-sess">Entry {dt(t.valid_from)} → {dt(t.valid_to)}</small>}</td>
            <td><select className="tp-bare rel" aria-label={`${t.name} release rule`} value={t.release} onChange={x => { const v = x.target.value; const ph = phases.find(q => `phase:${q.id}` === v); set(i, { release: v, ...(ph ? { sale_start: ph.starts_at } : {}) }); }}><option value="open">Open</option>{tiers.map((o, k) => k !== i && <option key={k} value={`after:${k}`}>After {o.name.replace(/ - General Admission$/, "")}</option>)}{phases.map(ph => <option key={ph.id} value={`phase:${ph.id}`}>{ph.name.split(" – ")[0]}</option>)}</select></td>
            <td><span className="tp-st"><Toggle checked={t.enabled} onChange={v => set(i, { enabled: v })} label={`${t.name} active`} /><em className={!t.enabled ? "off" : data.live ? t.status : t.release.startsWith("after") || (t.sale_start && Date.parse(t.sale_start) > now) ? "scheduled" : "on_sale"}>{!t.enabled ? <><EyeOff size={11} />Hidden</> : (data.live ? t.status : t.release.startsWith("after") || (t.sale_start && Date.parse(t.sale_start) > now) ? "scheduled" : "on_sale") === "scheduled" ? <><Clock size={11} />Scheduled</> : t.status === "sold_out" ? <><CircleDot size={11} />Sold out</> : <><CheckCircle2 size={11} />On sale</>}</em></span></td>
            <td><Menu label={`Options for ${t.name}`} width={200} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Options for ${t.name}`}><MoreHorizontal size={16} /></button>}>{close => <>
              {(["Limited time", "Most popular", "Featured", null] as const).map(b => <button key={String(b)} role="menuitem" className="k-menu-item" onClick={() => { set(i, { badge: b }); close(); }}><Tag size={14} />{b ? `Badge: ${b}` : "No badge"}</button>)}
              <label className="k-menu-item tp-ol">Max per order <input inputMode="numeric" aria-label={`${t.name} max per order`} value={t.order_limit} onChange={x => set(i, { order_limit: Math.min(100, Math.max(1, Number(x.target.value.replace(/\D/g, "")) || 1)) })} /></label>
              <button role="menuitem" className="k-menu-item" onClick={() => { setTiers(ts => [...ts.slice(0, i + 1), { ...t, id: undefined, name: `${t.name} (copy)`, sold: 0, status: "draft" }, ...ts.slice(i + 1)]); close(); }}><Copy size={14} />Duplicate</button>
              {i > 0 && <button role="menuitem" className="k-menu-item" onClick={() => { setTiers(ts => { const n = [...ts]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n.map(x => ({ ...x, release: x.release === `after:${i}` ? `after:${i - 1}` : x.release === `after:${i - 1}` ? `after:${i}` : x.release })); }); close(); }}><ArrowUp size={14} />Move up</button>}
              {i < tiers.length - 1 && <button role="menuitem" className="k-menu-item" onClick={() => { setTiers(ts => { const n = [...ts]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n.map(x => ({ ...x, release: x.release === `after:${i}` ? `after:${i + 1}` : x.release === `after:${i + 1}` ? `after:${i}` : x.release })); }); close(); }}><ArrowDown size={14} />Move down</button>}
              <div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" disabled={t.sold > 0} title={t.sold ? "Tiers with sales can't be removed — switch them off" : undefined} onClick={() => { setTiers(ts => ts.filter((_, k) => k !== i).map(x => { if (!x.release.startsWith("after:")) return x; const a = Number(x.release.slice(6)); return { ...x, release: a === i ? "open" : a > i ? `after:${a - 1}` : x.release }; })); close(); }}><Trash2 size={14} />Remove tier</button></>}</Menu></td>
          </tr>)}{!tiers.length && <tr><td colSpan={9} className="tp-empty">No tiers yet. <button className="k-link" onClick={suggest}>Suggest tiers from your sections</button> or <button className="k-link" onClick={() => addTier()}>add one</button>.</td></tr>}</tbody></table></div>
        <div className={`tp-tot ${total > sellable ? "bad" : ""}`}><Info size={14} /><span>{num(total)} of {num(sellable)} sellable tickets allocated{p.buffer_pct ? ` (${p.buffer_pct}% buffer held back)` : ""}</span><span className="tp-bar"><i style={{ width: `${Math.min(100, total / Math.max(1, sellable) * 100)}%` }} /></span></div>
      </Card>
      <div className="tp-col">
        <Card title="Revenue & inventory forecast" className="tp-fc" action={<span className="tp-in sel sm">Expected revenue</span>}>
          <div className="tp-kpis"><div><b>{gbp(Math.round(revenue))}</b><small>Total revenue (projected)</small></div><div><b>{num(total)}</b><small>Total tickets</small></div><div><b>{pct(total, capacity, 0)}</b><small>Inventory allocated</small></div></div>
          <svg className="tp-chart" viewBox="0 0 300 130" role="img" aria-label="Projected revenue by month">
            {Array.from({ length: Math.round(chart.top / chart.step) + 1 }, (_, k) => { const y = 108 - k * (96 / (chart.top / chart.step)); return <g key={k}><line x1="34" x2="296" y1={y} y2={y} stroke="#eef2f9" /><text x="28" y={y + 3} textAnchor="end" className="tp-ax">£{chart.step * k >= 1000 ? `${chart.step * k / 1000}K` : chart.step * k}</text></g>; })}
            {chart.rows.map((r, i) => { const w = 262 / chart.rows.length, bw = Math.min(46, w * .62), x = 34 + i * w + (w - bw) / 2; let y = 108; return <g key={r.key}>{r.parts.map(pt => { const h = pt.v / chart.top * 96; y -= h; return h > 0 ? <rect key={pt.g} x={x} y={y} width={bw} height={Math.max(0, h - 0.5)} fill={pt.c} rx="1" /> : null; })}<text x={x + bw / 2} y="123" textAnchor="middle" className="tp-ax">{r.label}</text></g>; })}
          </svg>
          <ul className="tp-leg2">{GROUPS.map(([g, c]) => <li key={g}><i style={{ background: c }} />{g}</li>)}</ul>
        </Card>
        <Card title="Release timeline" className="tp-tl" action={<Link className="k-btn outline sm" href="/organizer/calendar"><CalendarDays size={13} />View calendar</Link>}>
          <ol>{timeline.map((x, i) => <li key={i}><i style={{ background: x.c }} /><b>{dt(x.d)}</b><span>{x.label}</span></li>)}{!timeline.length && <li className="k-small">Set sale windows to build your timeline.</li>}</ol>
          {phases.length > 0 && <div className="tp-phases">{phases.map((ph, k) => <div key={ph.id}><span className="tp-pn">{k + 1}</span><input className="tp-bare b" aria-label="Phase name" value={ph.name} maxLength={60} onChange={x => setPhases(ps => ps.map(q => q.id === ph.id ? { ...q, name: x.target.value } : q))} /><input type="datetime-local" aria-label={`${ph.name} starts`} value={toLocal(ph.starts_at)} onChange={x => { const v = fromLocal(x.target.value); setPhases(ps => ps.map(q => q.id === ph.id ? { ...q, starts_at: v } : q)); setTiers(ts => ts.map(t => t.release === `phase:${ph.id}` ? { ...t, sale_start: v } : t)); }} /><small>{tiers.filter(t => t.release === `phase:${ph.id}`).length} tiers</small><button className="k-icon-btn" aria-label={`Remove ${ph.name}`} onClick={() => { setPhases(ps => ps.filter(q => q.id !== ph.id)); setTiers(ts => ts.map(t => t.release === `phase:${ph.id}` ? { ...t, release: "open" } : t)); }}><X size={13} /></button></div>)}</div>}
          <button className="k-link tp-addph" onClick={() => setPhases(ps => [...ps, { id: uid(), name: `Phase ${ps.length + 1}`, starts_at: at(e.starts_at, 60) }])}><Plus size={13} />Add phase</button>
        </Card>
      </div>
    </div>
    <div className="tp-g4">
      <Card title="Sales settings" className="tp-ss">
        <label className="tp-sr"><span>Maximum tickets per order</span><span className="tp-in sm"><input inputMode="numeric" aria-label="Maximum tickets per order" value={sales.order_limit} onChange={x => setSales(s => ({ ...s, order_limit: Math.min(100, Math.max(1, Number(x.target.value.replace(/\D/g, "")) || 1)) }))} /></span></label>
        {([["waiting_list", "Enable waiting list", "Allow customers to join a waiting list when sold out."], ["resale", "Enable resale", "Allow ticket resale through the marketplace."], ["show_remaining", "Show remaining inventory", "Display live ticket availability to customers."], ["countdown", "Show countdown timer", "Display a timer on the event page before sales open."], ["require_account", "Require account to purchase", "Only signed-in users can buy."], ["discount_codes", "Enable discount codes", "Allow promo and partner codes."]] as const).map(([k, l, d]) =>
          <div key={k} className="tp-tg"><span><b>{l} <Info size={11} /></b><small>{d}</small></span><Toggle checked={sales[k]} onChange={v => setSales(s => ({ ...s, [k]: v }))} label={l} /></div>)}
      </Card>
      <Card title="Promoter allocations" sub="Allocate a portion of tickets to promoters or partners." className="tp-pa" action={<button className="k-btn outline sm" onClick={() => setNewPromoter({ name: "", pct: 10 })}><Plus size={13} />Add allocation</button>}>
        <ul>{alloc.map(a => <li key={a.id}><span className="tp-pic"><Megaphone size={13} /></span><span className="k-grow"><b>{a.name}</b><small>{a.ticket_allocation ? `${num(a.ticket_allocation)} tickets (${pct(a.ticket_allocation, total)})` : "No allocation"} · {a.code}</small></span>
          <span className="tp-in xs"><input inputMode="numeric" aria-label={`${a.name} allocation`} placeholder="0" value={a.ticket_allocation ?? ""} onChange={x => setAllocEdits(m => ({ ...m, [a.id]: Number(x.target.value.replace(/\D/g, "")) || null }))} /></span><em className={`tp-pill ${a.status === "active" ? "live" : "draft"}`}>{a.status === "active" ? "Live" : a.status}</em></li>)}
          {!alloc.length && !newPromoter && <li className="k-small">No promoters yet.</li>}</ul>
        {newPromoter && <div className="tp-newp"><input className="tp-in2" placeholder="Promoter or partner name" aria-label="Promoter name" value={newPromoter.name} maxLength={60} onChange={x => setNewPromoter(n => n && { ...n, name: x.target.value })} /><span className="tp-in xs"><input inputMode="numeric" aria-label="Commission %" value={newPromoter.pct} onChange={x => setNewPromoter(n => n && { ...n, pct: Math.min(50, Number(x.target.value.replace(/\D/g, "")) || 0) })} /><em>%</em></span>
          <button className="k-btn primary sm" disabled={pending || newPromoter.name.trim().length < 2} onClick={() => void run(() => createPromoter({ event_id: e.id, name: newPromoter.name.trim(), commission_pct: newPromoter.pct })).then(r => { if (r.ok) setNewPromoter(null); })}>Add</button><button className="k-icon-btn" aria-label="Cancel" onClick={() => setNewPromoter(null)}><X size={14} /></button></div>}
      </Card>
      <Card title="Discount codes" className="tp-dc" action={<button className="k-btn outline sm" onClick={() => setPromos(ps => [...ps, { code: "", kind: "percent", amount: 10, valid_from: null, valid_until: null, max_uses: null, used: 0, status: "active" }])}><Plus size={13} />Add code</button>}>
        <div className="tp-tw"><table className="tp-t tp-dct"><thead><tr><th>Code</th><th>Discount</th><th>Valid from</th><th>Status</th><th /></tr></thead>
          <tbody>{promos.map((x, i) => <tr key={x.id ?? `p${i}`}><td><input className="tp-bare b" aria-label="Discount code" placeholder="CODE" value={x.code} maxLength={24} onChange={v => setPromos(ps => ps.map((q, k) => k === i ? { ...q, code: v.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") } : q))} /></td>
            <td><span className="tp-disc"><input inputMode="decimal" aria-label={`${x.code} amount`} value={x.amount} onChange={v => setPromos(ps => ps.map((q, k) => k === i ? { ...q, amount: Number(v.target.value.replace(/[^0-9.]/g, "")) || 0 } : q))} /><select aria-label={`${x.code} discount type`} value={x.kind} onChange={v => setPromos(ps => ps.map((q, k) => k === i ? { ...q, kind: v.target.value as Promo["kind"] } : q))}><option value="percent">%</option><option value="amount">£</option></select></span></td>
            <td><input className="tp-bare d" type="date" aria-label={`${x.code} valid from`} value={x.valid_from?.slice(0, 10) ?? ""} onChange={v => setPromos(ps => ps.map((q, k) => k === i ? { ...q, valid_from: v.target.value ? new Date(`${v.target.value}T00:00:00`).toISOString() : null } : q))} /></td>
            <td><em className={`tp-pill ${promoStatus(x).toLowerCase()}`}>{promoStatus(x) === "Active" ? <CheckCircle2 size={11} /> : <Clock size={11} />}{promoStatus(x)}</em></td>
            <td><button className="k-icon-btn" aria-label={`Remove ${x.code || "code"}`} onClick={() => setPromos(ps => ps.filter((_, k) => k !== i))}><X size={13} /></button></td></tr>)}{!promos.length && <tr><td colSpan={5} className="k-small">No codes yet.</td></tr>}</tbody></table></div>
      </Card>
      <Card className="tp-agent"><div className="tp-aih"><Sparkles size={20} className="tp-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span></div><p>I can help you optimise your ticket strategy, model revenue, and create a phased release plan.</p>
        <button onClick={suggest}><ListChecks size={14} />Suggest ticket tiers</button><button onClick={releasePlan}><CalendarRange size={14} />Create release plan</button><button onClick={breakEven}><Calculator size={14} />Model revenue &amp; break-even</button><button onClick={oversell}><ShieldAlert size={14} />Check for oversell risk</button></Card>
    </div>
    <Footer backHref={`${base}?step=1`} pending={pending} onDraft={() => void save(false)} onNext={() => void save(true)} nextDisabled={!tiers.length || total > sellable} />
  </>;
}
