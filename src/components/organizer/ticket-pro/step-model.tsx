"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Armchair, Stars, Check, Info, Sparkles, Lightbulb, CheckCircle2, MapPin, Map as MapIcon, PenSquare, Upload, Maximize, Plus, MoreHorizontal, ChevronDown, Trash2, Loader2 } from "lucide-react";
import { Menu, useAction, useKitToast } from "@/components/kit/client";
import { createClient } from "@/lib/supabase/client";
import { saveProModel } from "@/lib/actions/ticket-pro";
import { SECTION_TYPES, type ProSection, type ProSettings, type SectionType } from "@/lib/ticket-pro-model";
import type { ProSetup } from "@/lib/data/ticket-pro";
import { Card, Donut, Footer, VenueMap, num, pct, uid } from "./ui";

const COLORS = ["#2563eb", "#7c3aed", "#e0398b", "#e08a00", "#16a46c", "#64748b", "#0ea5c6", "#f97316"];

/** Recommended split for a given model and capacity (the same proportions a promoter would use for a large music event). */
function recommend(model: ProSettings["model"], cap: number): ProSection[] {
  const split: [string, SectionType, number][] = model === "general" ? [["General Admission", "standing", .86], ["VIP Area", "vip", .1], ["Accessible", "accessible", .025], ["Comps & Holds", "hold", .015]]
    : model === "reserved" ? [["Stalls", "reserved", .55], ["Premium Seated", "reserved", .3], ["Accessible", "accessible", .04], ["Comps & Holds", "hold", .02]]
    : [["General Admission", "standing", .625], ["VIP Left", "vip", .0833], ["VIP Right", "vip", .0833], ["Premium Seated", "reserved", .146], ["Accessible", "accessible", .042], ["Comps & Holds", "hold", .021]];
  return split.map(([name, type, f], i) => ({ id: uid(), name, type, capacity: Math.round(cap * f / 10) * 10, color: type === "hold" ? "#64748b" : type === "accessible" ? "#16a46c" : type === "vip" ? "#7c3aed" : type === "reserved" ? "#e08a00" : COLORS[i % COLORS.length]!, tiers: [], holds: 0 }));
}

export function StepModel({ data, base }: { data: ProSetup; base: string }) {
  const router = useRouter(); const toast = useKitToast(); const { run, pending } = useAction();
  const p = data.pro;
  const [model, setModel] = useState(p.model); const [capacity, setCapacity] = useState(p.capacity); const [buffer, setBuffer] = useState(p.buffer_pct);
  const [source, setSource] = useState(p.map_source); const [mapImg, setMapImg] = useState(p.map_image); const [busy, setBusy] = useState(false);
  const [sections, setSections] = useState<ProSection[]>(p.sections.length ? p.sections : data.mapSections);
  const venueCap = data.venueCap;
  const sum = sections.reduce((a, s) => a + s.capacity, 0); const bufferN = Math.round(capacity * buffer / 100); const sellable = capacity - bufferN;
  const rec = useMemo(() => recommend(model === "general" ? "hybrid" : model, capacity), [model, capacity]);
  const recLines = useMemo(() => { const m = new Map<string, number>(); for (const r of rec) { const k = r.type === "vip" ? (rec.filter(x => x.type === "vip").length > 1 ? "VIP (split left/right)" : "VIP") : r.type === "standing" ? "GA (standing)" : r.type === "accessible" ? "accessible (wheelchair + companion)" : r.type === "hold" ? "comps and holds" : r.name.toLowerCase().includes("premium") ? "reserved seats (central view)" : r.name; m.set(k, (m.get(k) ?? 0) + r.capacity); } return [...m].map(([l, n]) => [n, l] as const); }, [rec]);
  const set = (i: number, patch: Partial<ProSection>) => setSections(ss => ss.map((s, k) => k === i ? { ...s, ...patch } : s));
  const over = (venueCap != null && capacity > venueCap) || sum > capacity;
  const save = async (next: boolean) => {
    const r = await run(() => saveProModel(data.event.id, { model, capacity, buffer_pct: buffer, map_source: source, map_image: mapImg, sections }), { refresh: false });
    if (r.ok) router.push(next ? `${base}?step=2` : `/organizer/events/${data.event.id}?tab=sell`);
  };
  const upload = async (f: File) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type) || f.size > 10_000_000) return toast("Use a PNG, JPG or WebP under 10 MB", "error");
    setBusy(true); const sb = createClient();
    const path = `${data.workspaceId}/map-${crypto.randomUUID()}.${f.type.split("/")[1]!.replace("jpeg", "jpg")}`;
    const { error } = await sb.storage.from("event-media").upload(path, f, { contentType: f.type });
    setBusy(false); if (error) return toast("Upload failed", "error");
    setMapImg(sb.storage.from("event-media").getPublicUrl(path).data.publicUrl); setSource("upload"); toast("Map uploaded");
  };

  return <>
    <div className="tp-g1">
        <Card title="Ticketing model" sub="Choose how you want to structure ticket sales for this event." className="tp-a-model">
          <div className="tp-models" role="radiogroup" aria-label="Ticketing model">{([["general", Users, "General Admission", "Open standing or unreserved seating."], ["reserved", Armchair, "Reserved Seating", "Numbered seats with a venue map."], ["hybrid", Stars, "Hybrid", "Combination of GA and reserved."]] as const).map(([k, I, t, d]) =>
            <button key={k} role="radio" aria-checked={model === k} data-on={model === k || undefined} onClick={() => setModel(k)}><span className="tp-mi"><I size={26} strokeWidth={1.6} /></span><span><b>{t}</b><small>{d}</small></span>{model === k && <span className="tp-tick"><Check size={12} strokeWidth={3} /></span>}</button>)}</div>
        </Card>
        <div className="tp-g2 tp-a-cap">
          <Card title="Event capacity" sub="Set the total capacity for this event based on your venue and production plan.">
            <div className="tp-capg">
              <label className="tp-f"><span>Total venue capacity <Info size={12} /></span><span className="tp-in ro">{venueCap != null ? num(venueCap) : "Not confirmed"}</span></label>
              <label className="tp-f"><span>Event capacity (tickets) <Info size={12} /></span><span className={`tp-in ${venueCap != null && capacity > venueCap ? "bad" : ""}`}><input inputMode="numeric" aria-label="Event capacity" value={capacity} onChange={x => setCapacity(Math.max(1, Number(x.target.value.replace(/\D/g, "")) || 1))} />{venueCap != null && <em>{pct(capacity, venueCap, 0)}</em>}</span></label>
              <label className="tp-f"><span>Safety buffer <Info size={12} /></span><span className="tp-in sel"><select aria-label="Safety buffer" value={buffer} onChange={x => setBuffer(Number(x.target.value))}>{[0, 2, 5, 10, 15].map(b => <option key={b} value={b}>{b}% ({num(Math.round(capacity * b / 100))})</option>)}</select><ChevronDown size={14} /></span><small>Kept for operations and safety.</small></label>
            </div>
            {venueCap != null && capacity > venueCap && <p className="tp-err"><Info size={13} />Event capacity is above the approved venue capacity of {num(venueCap)}.</p>}
          </Card>
          <Card title="Capacity breakdown" className="tp-brk">
            <div className="tp-brkg"><Donut parts={sections.map(s => ({ value: s.capacity, color: s.color }))} total={sum || capacity} label="Total tickets" />
              <ul className="tp-legend">{sections.map(s => <li key={s.id}><i style={{ background: s.color }} /><span>{s.name}</span><b>{num(s.capacity)}</b><small>{pct(s.capacity, sum)}</small></li>)}{!sections.length && <li className="k-small">No sections yet.</li>}</ul></div>
          </Card>
        </div>
        <div className="tp-col tp-a-right">
        <Card title={<><Lightbulb size={16} className="tp-amber" />AI recommendations</>} className="tp-ai">
          <div className="tp-aih"><Sparkles size={18} className="tp-spark" /><b>Gala Agent</b><span className="k-beta">BETA</span><button className="k-btn primary sm" onClick={() => { setSections(rec); if (model === "general") setModel("hybrid"); toast("Suggested sections applied — adjust as needed"); }}>Use suggestion</button></div>
          <p>For a {data.event.event_type.replace(/_/g, " ")} of this size, I recommend a hybrid model with GA standing, a premium seated area, VIP zones and accessible allocation. This gives the best mix of revenue and experience.</p>
          <ul className="tp-recs">{recLines.map(([n, l]) => <li key={l}><CheckCircle2 size={16} />{num(n)} {l}</li>)}</ul>
        </Card>
        <Card title={<><Lightbulb size={16} className="tp-amber" />Important considerations</>} className="tp-cons">
          <ul><li>Ensure total inventory does not exceed venue approved capacity.</li><li>Keep a safety buffer for production, staff and emergency use.</li><li>Allocate accessible spaces in line with venue requirements.</li><li>You can adjust allocations and holds in the next steps.</li></ul>
        </Card>
        </div>
        <Card title="Venue map" sub="Load a map from the venue or create a custom layout for this event." className="tp-mapc tp-a-map"
          action={<><span className="tp-in sel sm"><MapPin size={14} /><span>{data.venueName ?? "Main site"}</span></span><button className="k-btn outline sm" onClick={() => document.querySelector(".tp-map")?.requestFullscreen?.()}><Maximize size={14} />Full screen</button></>}>
          <div className="tp-srcs" role="radiogroup" aria-label="Map source">
            <button role="radio" aria-checked={source === "venue"} data-on={source === "venue" || undefined} onClick={() => { setSource("venue"); setMapImg(null); if (data.mapSections.length) setSections(data.mapSections); }}><MapIcon size={18} /><span><b>Use venue map</b><small>{data.hasVenueMap ? "Import sections from your layout" : "Import from venue profile"}</small></span></button>
            <Link role="radio" aria-checked={source === "custom"} href={`/organizer/events/${data.event.id}/map`} onClick={() => setSource("custom")}><PenSquare size={18} /><span><b>Create custom map</b><small>Design in Gala Dock</small></span></Link>
            <label role="radio" aria-checked={source === "upload"} data-on={source === "upload" || undefined}>{busy ? <Loader2 size={18} className="k-spin" /> : <Upload size={18} />}<span><b>Upload map</b><small>Use your own image</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={x => { const f = x.target.files?.[0]; if (f) void upload(f); x.target.value = ""; }} /></label>
          </div>
          <div className="tp-mapg"><VenueMap sections={sections.filter(s => s.type !== "hold")} image={mapImg} />
        <div className="tp-secs"><div className="tp-ch"><h2>Sections &amp; allocations</h2><button className="k-btn outline sm" onClick={() => setSections(ss => [...ss, { id: uid(), name: `Section ${ss.length + 1}`, type: "standing", capacity: Math.max(0, capacity - sum), color: COLORS[ss.length % COLORS.length]!, tiers: [], holds: 0 }])}><Plus size={14} />Add section</button></div>
            <table className="tp-t"><thead><tr><th>Section</th><th>Type</th><th>Capacity</th><th>Allocation</th><th /></tr></thead>
              <tbody>{sections.map((s, i) => <tr key={s.id}><td><span className="tp-sn2"><i style={{ background: s.color }} /><input aria-label="Section name" value={s.name} maxLength={60} onChange={x => set(i, { name: x.target.value })} /></span></td>
                <td><select className="tp-bare" aria-label={`${s.name} type`} value={s.type} onChange={x => set(i, { type: x.target.value as SectionType })}>{Object.entries(SECTION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td><input className="tp-bare num" inputMode="numeric" aria-label={`${s.name} capacity`} value={s.capacity} onChange={x => set(i, { capacity: Number(x.target.value.replace(/\D/g, "")) || 0 })} /></td><td>{pct(s.capacity, capacity)}</td>
                <td><Menu label={`Options for ${s.name}`} width={180} trigger={({ toggle, open, id }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Options for ${s.name}`}><MoreHorizontal size={15} /></button>}>{close => <><div className="tp-sw">{COLORS.map(c => <button key={c} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => { set(i, { color: c }); close(); }} />)}</div><div className="k-menu-sep" /><button role="menuitem" className="k-menu-item k-red" onClick={() => { setSections(ss => ss.filter((_, k) => k !== i)); close(); }}><Trash2 size={14} />Remove section</button></>}</Menu></td></tr>)}</tbody>
              <tfoot><tr><td colSpan={2}>Total {bufferN ? <small>· {num(bufferN)} buffer · {num(sellable)} sellable</small> : null}</td><td className={sum > capacity ? "k-red" : ""}>{num(sum)}</td><td>{pct(sum, capacity)}</td><td /></tr></tfoot></table>
            {sum > capacity && <p className="tp-err"><Info size={13} />Sections exceed event capacity by {num(sum - capacity)}.</p>}
          </div>
          </div>
        </Card>
    </div>
    <Footer cancelHref={`/organizer/events/${data.event.id}?tab=sell`} pending={pending} onDraft={() => void save(false)} onNext={() => void save(true)} nextDisabled={over} />
  </>;
}
