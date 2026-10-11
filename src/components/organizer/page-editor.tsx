"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { CalendarDays, MapPin, ExternalLink, Eye, Save, Rocket, GripVertical, ChevronRight, Image as ImageIcon, AlignLeft, ListOrdered, Users, Ticket, Accessibility, Building2, Star, CircleHelp, Images, LayoutGrid, Monitor, Smartphone, Loader2, X, RefreshCw } from "lucide-react";
import { Toggle, useAction } from "@/components/kit/client";
import { savePage } from "@/lib/actions/builders";
import type { Block } from "@/lib/page-blocks";

type Hero = { title: string; subtitle: string; image: string; overlay: "dark" | "light" | "none"; primary: string; secondary: string; video: string };
type State = { order: Block[]; visible: Record<Block, boolean>; hero: Hero; seo: { title: string; description: string } };
type Ev = { id: string; name: string; slug: string | null; status: string; visibility: string; starts_at: string | null; ends_at: string | null; venue: string; cover: string; gallery: string[] };
const META: Record<Block, [typeof ImageIcon, string, string]> = { hero: [ImageIcon, "Hero / Media", "Event title, key info and hero visuals"], about: [AlignLeft, "About", "Description and overview"], programme: [ListOrdered, "Programme", "Schedule and timings"], performers: [Users, "Performers / Speakers", "Artists, DJs, speakers or hosts"], venue: [MapPin, "Venue & Map", "Location, map and practical info"], tickets: [Ticket, "Tickets", "Ticket types and purchase"], accessibility: [Accessibility, "Accessibility", "Access information"], organiser: [Building2, "Organiser", "Your profile and branding"], sponsors: [Star, "Sponsors", "Sponsors and partners"], faqs: [CircleHelp, "FAQ", "Common questions"], gallery: [Images, "Previous Event Media", "Photos and videos from past events"], related: [LayoutGrid, "Related Events", "Show similar upcoming events"] };
const LOCKED: Block[] = ["hero", "tickets"];

export function PageEditor({ tab, event: e, initial }: { tab: "edit" | "preview" | "seo"; event: Ev; initial: State }) {
  const { run, pending } = useAction(); const frame = useRef<HTMLIFrameElement>(null);
  const [st, setSt] = useState(initial); const [sel, setSel] = useState<Block>("hero"); const [device, setDevice] = useState<"desktop" | "mobile">("desktop"); const [drag, setDrag] = useState<number | null>(null); const [stamp, setStamp] = useState(0);
  const setHero = (p: Partial<Hero>) => setSt(s => ({ ...s, hero: { ...s.hero, ...p } }));
  const save = async (publish: boolean) => { const r = await run(() => savePage({ event_id: e.id, ...st, publish })); if (r.ok) setStamp(Date.now()); };
  const move = (from: number, to: number) => setSt(s => { const o = [...s.order]; const [x] = o.splice(from, 1); o.splice(to, 0, x!); return { ...s, order: o }; });
  const live = ["published", "on_sale", "live"].includes(e.status);
  const src = e.slug ? `/events/${e.slug}?preview=1&t=${stamp}` : null;
  const base = `/organizer/events/${e.id}/page`;
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date TBC";

  return <>
    <div className="pe2-head"><div className="k-grow"><div className="k-row" style={{ gap: 10 }}><h1>{e.name}</h1><span className={`mn-st ${live ? "green" : "gray"}`}>{live ? "Published" : "Draft page"}</span></div>
      <p className="pr-meta"><span><CalendarDays size={14} />{fmt(e.starts_at)}</span><span><MapPin size={14} />{e.venue}</span>{e.slug && <Link className="k-link" href={`/events/${e.slug}`} target="_blank">View public page <ExternalLink size={12} /></Link>}</p></div>
      <div className="k-row" style={{ gap: 10 }}>{src && <Link className="k-btn outline" href={src} target="_blank"><Eye size={15} />Preview</Link>}<button className="k-btn outline" disabled={pending} onClick={() => void save(false)}><Save size={15} />Save draft</button><button className="k-btn primary" disabled={pending || e.visibility !== "public"} title={e.visibility !== "public" ? "Make the event public first" : undefined} onClick={() => void save(true)}>{pending ? <Loader2 size={15} className="k-spin" /> : <Rocket size={15} />}{live ? "Update" : "Publish"}</button></div></div>
    <nav className="k-tabs" aria-label="Editor sections">{([["edit", "Edit"], ["preview", "Preview"], ["seo", "SEO & Sharing"]] as const).map(([k, l]) => <Link key={k} className="k-tab" href={k === "edit" ? base : `${base}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{l}</Link>)}</nav>
    {tab === "seo" ? <section className="k-card pe2-seo"><h2>SEO &amp; sharing</h2><p className="pr-sub">How your page appears in search results and when shared.</p>
      <label className="ce2-f"><span>Page title</span><input className="ce2-in" maxLength={70} value={st.seo.title} onChange={x => setSt(s => ({ ...s, seo: { ...s.seo, title: x.target.value } }))} /><small>{st.seo.title.length}/70</small></label>
      <label className="ce2-f" style={{ marginTop: 12 }}><span>Meta description</span><textarea className="ce2-ta" maxLength={170} value={st.seo.description} onChange={x => setSt(s => ({ ...s, seo: { ...s.seo, description: x.target.value } }))} /><small>{st.seo.description.length}/170</small></label>
      <div className="pe2-serp"><small>galadock.com › events › {e.slug ?? "your-event"}</small><b>{st.seo.title}</b><p>{st.seo.description}</p></div>
      <div className="pe2-og">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={st.hero.image || e.cover} alt="" /><div><b>{st.seo.title}</b><small>{st.seo.description}</small></div></div></section>
    : <div className={`pe2-grid ${tab === "preview" ? "full" : ""}`}>
      {tab === "edit" && <section className="k-card pe2-blocks"><h2>Page blocks</h2><p className="pr-sub">Drag to reorder, toggle visibility and edit each section.</p>
        <ol>{st.order.map((b, i) => { const [I, t, d] = META[b]; return <li key={b} draggable onDragStart={() => setDrag(i)} onDragOver={x => { x.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }} onDragEnd={() => setDrag(null)} className={`${sel === b ? "on" : ""} ${drag === i ? "drag" : ""}`}>
          <button className="pe2-grip" aria-label={`Reorder ${t}`} onKeyDown={x => { if (x.key === "ArrowUp" && i > 0) { x.preventDefault(); move(i, i - 1); } if (x.key === "ArrowDown" && i < st.order.length - 1) { x.preventDefault(); move(i, i + 1); } }}><GripVertical size={15} /></button>
          <span className="pe2-bi"><I size={18} /></span><button className="pe2-bt" onClick={() => setSel(b)}><b>{t}</b><small>{d}</small></button>
          <Toggle checked={st.visible[b]} disabled={LOCKED.includes(b)} onChange={v => setSt(s => ({ ...s, visible: { ...s.visible, [b]: v } }))} label={`Show ${t}`} /><ChevronRight size={15} /></li>; })}</ol></section>}
      <section className="k-card pe2-prev"><div className="k-between"><h2>Live preview</h2><span className="k-row" style={{ gap: 8 }}><span className="pe2-dev"><button aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} aria-label="Desktop"><Monitor size={15} /></button><button aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} aria-label="Mobile"><Smartphone size={15} /></button></span><button className="k-btn outline sm" onClick={() => { void save(false); }}><RefreshCw size={13} />Save &amp; refresh</button>{src && <Link className="k-btn outline sm" href={src} target="_blank"><ExternalLink size={13} />Open in new tab</Link>}</span></div>
        {src ? <div className={`pe2-frame ${device}`}><iframe ref={frame} key={stamp} src={src} title="Public page preview" /></div> : <div className="pe2-empty">Save the page once to create its public address, then the live preview appears here.</div>}</section>
      {tab === "edit" && <section className="k-card pe2-panel"><div className="k-between"><h2>Editing: {META[sel][1]}</h2><button className="k-icon-btn" aria-label="Back to hero" onClick={() => setSel("hero")}><X size={15} /></button></div>
        {sel === "hero" ? <>
          <b className="pe2-sh">Hero content</b>
          <label className="ce2-f"><span className="k-between">Event title <small>{st.hero.title.length}/100</small></span><input className="ce2-in" maxLength={100} value={st.hero.title} onChange={x => setHero({ title: x.target.value })} /></label>
          <label className="ce2-f"><span className="k-between">Subtitle <small>{st.hero.subtitle.length}/200</small></span><input className="ce2-in" maxLength={200} value={st.hero.subtitle} onChange={x => setHero({ subtitle: x.target.value })} /></label>
          <b className="pe2-sh">Hero media</b>{/* eslint-disable-next-line @next/next/no-img-element */}<img className="pe2-hm" src={st.hero.image || e.cover} alt="" />
          <div className="pe2-pick">{[e.cover, ...e.gallery].filter(Boolean).slice(0, 6).map(g => <button key={g} aria-pressed={st.hero.image === g} onClick={() => setHero({ image: g })}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={g} alt="" /></button>)}<Link href={`/organizer/events/${e.id}/media`} className="pe2-addimg">+</Link></div>
          <label className="ce2-f"><span>Overlay style</span><select className="ce2-in" value={st.hero.overlay} onChange={x => setHero({ overlay: x.target.value as Hero["overlay"] })}><option value="dark">Dark gradient</option><option value="light">Light gradient</option><option value="none">None</option></select></label>
          <b className="pe2-sh">Call to action</b><div className="ce2-g2 tight"><label className="ce2-f"><small>Primary button</small><input className="ce2-in" maxLength={30} value={st.hero.primary} onChange={x => setHero({ primary: x.target.value })} /></label><label className="ce2-f"><small>Secondary button</small><input className="ce2-in" maxLength={30} value={st.hero.secondary} onChange={x => setHero({ secondary: x.target.value })} /></label></div>
          <label className="ce2-f"><small>Video URL (YouTube/Vimeo)</small><input className="ce2-in" value={st.hero.video} onChange={x => setHero({ video: x.target.value })} placeholder="https://youtu.be/..." /></label>
        </> : <div className="pe2-other"><p className="k-small">{META[sel][2]}. Content for this block comes from your event records:</p>
          <Link className="k-btn outline" href={sel === "tickets" ? `/organizer/events/${e.id}/tickets/setup` : sel === "programme" || sel === "performers" ? `/organizer/events/${e.id}?tab=plan` : sel === "gallery" ? `/organizer/events/${e.id}/media` : sel === "venue" ? `/organizer/events/${e.id}/map` : `/organizer/events/${e.id}`}>Edit {META[sel][1].toLowerCase()} <ChevronRight size={14} /></Link>
          <div className="pe2-vis"><span>Visible on page</span><Toggle checked={st.visible[sel]} disabled={LOCKED.includes(sel)} onChange={v => setSt(s => ({ ...s, visible: { ...s.visible, [sel]: v } }))} label="Visible" /></div></div>}</section>}
    </div>}
  </>;
}
