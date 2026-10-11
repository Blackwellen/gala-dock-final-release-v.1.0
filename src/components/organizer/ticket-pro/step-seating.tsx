"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenSquare, Info, CheckCircle2, AlertTriangle, Sparkles, Wand2, Lock, Plus, X } from "lucide-react";
import { Menu, useAction, useKitToast } from "@/components/kit/client";
import { saveAllocation } from "@/lib/actions/ticket-pro";
import { SECTION_TYPES, type ProSection } from "@/lib/ticket-pro-model";
import type { ProSetup } from "@/lib/data/ticket-pro";
import { Card, Footer, VenueMap, num, pct } from "./ui";

export function StepSeating({ data, base }: { data: ProSetup; base: string }) {
  const router = useRouter(); const toast = useKitToast(); const { run, pending } = useAction(); const e = data.event;
  const [sections, setSections] = useState<ProSection[]>(data.pro.sections);
  const tiers = data.tiers.filter(t => t.id && !["hidden", "paused"].includes(t.status)) as (ProSetup["tiers"][number] & { id: string })[];
  const set = (i: number, patch: Partial<ProSection>) => setSections(ss => ss.map((s, k) => k === i ? { ...s, ...patch } : s));
  const cap = sections.reduce((a, s) => a + s.capacity, 0), held = sections.reduce((a, s) => a + s.holds, 0) + sections.filter(s => s.type === "hold").reduce((a, s) => a + s.capacity - s.holds, 0);
  const assigned = sections.filter(s => s.tiers.length).reduce((a, s) => a + s.capacity - s.holds, 0);
  const room = (id: string) => sections.filter(s => s.tiers.includes(id)).reduce((a, s) => a + s.capacity - s.holds, 0);
  const issues = tiers.filter(t => sections.some(s => s.tiers.includes(t.id)) && t.quantity > room(t.id));
  const unassigned = tiers.filter(t => !sections.some(s => s.tiers.includes(t.id)));
  const tierColor = (s: ProSection) => tiers.find(t => s.tiers[0] === t.id)?.color ?? null;
  // Match tiers to sections by type: GA/early → standing, VIP → vip, accessible → accessible, the rest to reserved/standing.
  const auto = () => {
    setSections(ss => ss.map(s => ({ ...s, tiers: s.type === "hold" ? [] : tiers.filter(t => s.type === "standing" ? ["general", "early", "group", "student"].includes(t.kind) && !/seat/i.test(t.name) : s.type === "vip" ? t.kind === "vip" : s.type === "accessible" ? t.kind === "accessible" : s.type === "reserved" ? /seat|premium|reserved/i.test(t.name) || t.kind === "comp" : false).map(t => t.id) })));
    toast("Tiers matched to sections — review the allocation");
  };
  const save = async (next: boolean) => { const r = await run(() => saveAllocation(e.id, { sections }), { refresh: false }); if (r.ok) router.push(next ? `${base}?step=4` : `/organizer/events/${e.id}?tab=sell`); };

  return <>
    <div className="tp-kp4">{([["Event capacity", num(data.pro.capacity), ""], ["Mapped to sections", num(cap), pct(cap, data.pro.capacity, 0)], ["Assigned to tiers", num(assigned), pct(assigned, cap, 0)], ["Holds & comps", num(held), pct(held, cap, 1)]] as const).map(([l, v, s]) => <div key={l} className="tp-kp"><small>{l}</small><b>{v}</b>{s && <em>{s}</em>}</div>)}</div>
    <div className="tp-g3s">
      <Card title="Seating plan" sub={data.hasVenueMap ? "Sections from your event layout, coloured by the tier that sells them." : "Schematic plan of your sections, coloured by the tier that sells them."} className="tp-mapc"
        action={<Link className="k-btn outline sm" href={`/organizer/events/${e.id}/map`}><PenSquare size={14} />Open layout builder</Link>}>
        <VenueMap sections={sections.filter(s => s.type !== "hold")} image={data.pro.map_image} tierColor={tierColor} />
        <ul className="tp-leg2 tiers">{tiers.map(t => <li key={t.id}><i style={{ background: t.color }} />{t.name}</li>)}</ul>
      </Card>
      <div className="tp-col">
        <Card title="Allocation checks" className="tp-chk">
          <ul>
            <li data-ok={cap <= data.pro.capacity || undefined}>{cap <= data.pro.capacity ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}Sections fit event capacity ({num(cap)} / {num(data.pro.capacity)})</li>
            <li data-ok={!issues.length || undefined}>{!issues.length ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{issues.length ? `${issues.map(t => t.name).join(", ")} exceed${issues.length === 1 ? "s" : ""} section space` : "Every tier fits its sections after holds"}</li>
            <li data-ok={!unassigned.length || undefined}>{!unassigned.length ? <CheckCircle2 size={15} /> : <Info size={15} />}{unassigned.length ? `${unassigned.length} tier${unassigned.length > 1 ? "s" : ""} not assigned (sold from general capacity)` : "All tiers are assigned to sections"}</li>
            <li data-ok={sections.some(s => s.type === "accessible") || undefined}>{sections.some(s => s.type === "accessible") ? <CheckCircle2 size={15} /> : <Info size={15} />}{sections.some(s => s.type === "accessible") ? "Accessible sections are allocated" : "No accessible section yet"}</li>
          </ul>
        </Card>
        <Card className="tp-agent"><div className="tp-aih"><Sparkles size={20} className="tp-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span></div><p>I can match your tiers to sections by type and flag any tier that won&apos;t fit after holds.</p><button onClick={auto}><Wand2 size={14} />Auto-assign tiers to sections</button></Card>
      </div>
    </div>
    <Card title="Sections & allocation" sub="Choose which tiers sell from each section and how many places to hold back for production, artists and guests." className="tp-alc">
      <div className="tp-tw"><table className="tp-t"><thead><tr><th>Section</th><th>Type</th><th>Capacity</th><th>Tiers selling here</th><th>Holds</th><th>Sellable</th></tr></thead>
        <tbody>{sections.map((s, i) => <tr key={s.id}><td><span className="tp-sn2"><i style={{ background: s.color }} />{s.name}</span></td><td>{SECTION_TYPES[s.type]}</td><td>{num(s.capacity)}</td>
          <td>{s.type === "hold" ? <span className="tp-lock"><Lock size={12} />Not for sale</span> : <span className="tp-chips">{s.tiers.map(id => { const t = tiers.find(x => x.id === id); return t ? <em key={id} style={{ borderColor: t.color, color: t.color }}>{t.name}<button aria-label={`Remove ${t.name} from ${s.name}`} onClick={() => set(i, { tiers: s.tiers.filter(x => x !== id) })}><X size={10} /></button></em> : null; })}
            <Menu label={`Assign tier to ${s.name}`} width={220} trigger={({ toggle, open, id }) => <button className="tp-chipadd" onClick={toggle} aria-expanded={open} aria-controls={id}><Plus size={12} />Assign</button>}>{close => <>{tiers.filter(t => !s.tiers.includes(t.id)).map(t => <button key={t.id} role="menuitem" className="k-menu-item" onClick={() => { set(i, { tiers: [...s.tiers, t.id] }); close(); }}><i className="tp-dot" style={{ background: t.color }} />{t.name}</button>)}{tiers.every(t => s.tiers.includes(t.id)) && <span className="k-menu-item k-muted">All tiers assigned</span>}</>}</Menu></span>}</td>
          <td><span className="tp-in xs"><input inputMode="numeric" aria-label={`${s.name} holds`} value={s.holds} onChange={x => set(i, { holds: Math.min(s.capacity, Number(x.target.value.replace(/\D/g, "")) || 0) })} /></span></td>
          <td>{s.type === "hold" ? "—" : num(s.capacity - s.holds)}</td></tr>)}
          {!sections.length && <tr><td colSpan={6} className="tp-empty">No sections yet. <Link className="k-link" href={`${base}?step=1`}>Add sections in Model &amp; Capacity</Link>.</td></tr>}</tbody></table></div>
      {issues.length > 0 && <div className="tp-err">{issues.map(t => <span key={t.id}><AlertTriangle size={13} />{t.name}: {num(t.quantity)} tickets but only {num(room(t.id))} places in its sections.</span>)}</div>}
    </Card>
    <Footer backHref={`${base}?step=2`} pending={pending} onDraft={() => void save(false)} onNext={() => void save(true)} nextDisabled={issues.length > 0 || cap > data.pro.capacity} />
  </>;
}
