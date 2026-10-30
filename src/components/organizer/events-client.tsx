"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal, MoreHorizontal, Copy, Archive, ExternalLink, LayoutTemplate, Eye, Download, Upload, Plus, ChevronDown, CalendarDays, TrendingUp } from "lucide-react";
import { Menu, Dialog, useAction, useKitToast } from "@/components/kit/client";
import { archiveEvent, importEvents } from "@/lib/actions/events";
import { useDuplicateDialog } from "./event/duplicate-dialog";

export function useQueryNav() {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams(); const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => { const p = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(patch)) { if (v == null || v === "" || v === "all") p.delete(k); else p.set(k, v); } if (!("page" in patch)) p.delete("page"); start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false })); };
  return { set, params, pending };
}

export function EventFilters({ clients, venues, types, owners }: { clients: string[]; venues: string[]; types: { key: string; label: string }[]; owners: string[] }) {
  const { set, params, pending } = useQueryNav(); const [q, setQ] = useState(params.get("q") ?? ""); const [more, setMore] = useState(false);
  const sel = (key: string, label: string, opts: { v: string; l: string }[]) => <label className="k-sr-wrap"><span className="k-sr">{label}</span><select className="k-select ev-filter" value={params.get(key) ?? "all"} onChange={e => set({ [key]: e.target.value })} aria-label={label}><option value="all">{label}: All</option>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>;
  return <div className="ev-filters" aria-busy={pending}>
    <form className="k-input-icon ev-search" role="search" onSubmit={e => { e.preventDefault(); set({ q }); }}><Search size={15} /><input className="k-input" placeholder="Search events..." value={q} onChange={e => setQ(e.target.value)} aria-label="Search events" /></form>
    {sel("client", "Client", clients.map(c => ({ v: c, l: c })))}
    {sel("type", "Event type", types.map(t => ({ v: t.key, l: t.label })))}
    {sel("owner", "Owner", owners.map(o => ({ v: o, l: o })))}
    {sel("venue", "Venue", venues.map(v => ({ v, l: v })))}
    {sel("date", "Date", [{ v: "30", l: "Next 30 days" }, { v: "90", l: "Next 90 days" }, { v: "365", l: "Next 12 months" }, { v: "past", l: "Past" }])}
    {sel("status", "Status", ["draft", "planning", "ready", "on_sale", "live", "completed", "cancelled", "archived"].map(s => ({ v: s, l: s.replace("_", " ").replace(/^./, c => c.toUpperCase()) })))}
    {sel("ticketed", "Ticketed", [{ v: "yes", l: "Ticketed" }, { v: "no", l: "Not ticketed" }])}
    <button type="button" className="k-btn outline ev-more" onClick={() => setMore(true)}><SlidersHorizontal size={15} />More filters</button>
    <Dialog open={more} onClose={() => setMore(false)} title="More filters" sub="Narrow the portfolio by location and readiness risk.">
      <div className="k-col" style={{ gap: 12 }}>
        <label className="k-field"><span>Location / city</span><input className="k-input" defaultValue={params.get("city") ?? ""} id="f-city" /></label>
        <label className="k-field"><span>Readiness risk</span><select className="k-select" defaultValue={params.get("risk") ?? "all"} id="f-risk"><option value="all">Any</option><option value="high">High risk (&lt;50%)</option><option value="medium">Medium (50–74%)</option><option value="low">Low (75%+)</option></select></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button className="k-btn ghost" onClick={() => { set({ city: null, risk: null }); setMore(false); }}>Clear</button><button className="k-btn primary" onClick={() => { set({ city: (document.getElementById("f-city") as HTMLInputElement).value, risk: (document.getElementById("f-risk") as HTMLSelectElement).value }); setMore(false); }}>Apply filters</button></div>
      </div>
    </Dialog>
  </div>;
}

export function EventRowMenu({ id, name, slug, isPublic }: { id: string; name: string; slug: string | null; isPublic: boolean }) {
  const { run, pending } = useAction(); const [confirm, setConfirm] = useState(false); const dup = useDuplicateDialog();
  return <>
    {dup.dialog}
    <Menu label={`Actions for ${name}`} width={220} trigger={({ open, toggle, id: mid }) => <button className="k-icon-btn" onClick={toggle} aria-expanded={open} aria-controls={mid} aria-label={`Actions for ${name}`}><MoreHorizontal size={16} /></button>}>
      {close => <>
        <Link role="menuitem" className="k-menu-item" href={`/organizer/events/${id}`} onClick={close}><ExternalLink size={15} />Open event</Link>
        <button role="menuitem" className="k-menu-item" disabled={pending} onClick={() => { close(); dup.open({ id, name }); }}><Copy size={15} />Duplicate</button>
        <Link role="menuitem" className="k-menu-item" href={`/organizer/events/${id}/template?step=1`} onClick={close}><LayoutTemplate size={15} />Save as template</Link>
        {isPublic && slug ? <Link role="menuitem" className="k-menu-item" href={`/events/${slug}`} target="_blank" onClick={close}><Eye size={15} />Public preview</Link> : <span className="k-menu-item k-muted" title="Publish the event page to preview it publicly"><Eye size={15} />Public preview (not published)</span>}
        <div className="k-menu-sep" />
        <button role="menuitem" className="k-menu-item k-red" onClick={() => { close(); setConfirm(true); }}><Archive size={15} />Archive</button>
      </>}
    </Menu>
    <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Archive ${name}?`} sub="Archived events leave your active portfolio. Bookings, orders, payments and audit history are kept." footer={<><button className="k-btn ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="k-btn danger" disabled={pending} onClick={async () => { const r = await run(() => archiveEvent(id)); if (r.ok) setConfirm(false); }}>Archive event</button></>}>
      <div className="k-notice amber"><span>Live events can&apos;t be archived, and events with valid tickets must be completed, cancelled or refunded first.</span></div>
    </Dialog>
  </>;
}

/** CSV export of the current (filtered) rows; import opens a guided dialog. */
export function ImportExport({ rows }: { rows: Record<string, string | number>[] }) {
  const toast = useKitToast(); const [open, setOpen] = useState(false); const { run } = useAction();
  const exportCsv = () => {
    // Rows ticked in the list view narrow the export; with nothing ticked every filtered event is exported.
    const picked = new Set([...document.querySelectorAll<HTMLInputElement>('input[name="ev-select"]:checked')].map(i => i.value));
    const out = picked.size ? rows.filter(r => picked.has(String(r.id))) : rows;
    if (!out.length) { toast("Nothing to export with the current filters.", "error"); return; }
    const head = Object.keys(out[0]!); const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...out.map(r => head.map(h => esc(r[h])).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `gala-dock-events-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
    toast(`Exported ${out.length} event${out.length === 1 ? "" : "s"}${picked.size ? " (selected)" : ""}`);
  };
  return <>
    <button className="k-btn outline lg" onClick={() => setOpen(true)}><Download size={16} />Import</button>
    <button className="k-btn outline lg" onClick={exportCsv}><Upload size={16} />Export</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Import events" sub="Bring existing events in from a spreadsheet.">
      <p className="k-small">Upload a CSV with a header row: <b>name</b> (required), <b>event_type</b>, <b>date</b>, <b>venue</b>, <b>capacity</b>, <b>budget</b>. Each row is created as a <b>Draft</b> event so you can review it before planning.</p>
      <label className="k-field" style={{ marginTop: 12 }}><span>CSV file</span><input className="k-input" type="file" accept=".csv,text/csv" style={{ paddingTop: 6 }} onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return; if (f.size > 1_000_000) { toast("File is larger than 1 MB.", "error"); return; }
        const rows = parseCsv(await f.text()); const r = await run(() => importEvents(rows)); if (r.ok) setOpen(false);
      }} /></label>
    </Dialog>
  </>;
}

/** Header checkbox for the events list: ticks/unticks every row on this page (rows feed Export). */
export function SelectAllEvents() {
  return <input type="checkbox" aria-label="Select all events on this page" onChange={e => {
    const on = e.currentTarget.checked;
    e.currentTarget.closest("table")?.querySelectorAll<HTMLInputElement>('input[name="ev-select"]').forEach(i => { i.checked = on; });
  }} />;
}

/** Minimal RFC4180 CSV parser → array of objects keyed by lower-cased header. */
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim())); if (!head) return [];
  const keys = head.map(h => h.trim().toLowerCase());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim() || undefined])));
}

export function CreateEventSplit() {
  return <Menu label="Create event options" width={240} trigger={({ toggle, open, id }) => <div className="k-split"><Link href="/organizer/events/new?step=1" className="k-btn primary lg"><Plus size={17} />Create Event</Link><button className="k-btn primary lg" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label="More create options"><ChevronDown size={16} /></button></div>}>
    {close => <><Link role="menuitem" className="k-menu-item" href="/organizer/events/new?step=1" onClick={close}><CalendarDays size={15} />Blank event</Link>
      <Link role="menuitem" className="k-menu-item" href="/organizer/events?tab=templates" onClick={close}><LayoutTemplate size={15} />From a template</Link>
      <Link role="menuitem" className="k-menu-item" href="/organizer/sales" onClick={close}><TrendingUp size={15} />From a won lead</Link></>}
  </Menu>;
}
export function PerPageMenu({ per, hrefs }: { per: number; hrefs: { n: number; href: string }[] }) {
  return <Menu label="Rows per page" width={140} trigger={({ toggle, open, id }) => <button className="k-btn ghost" onClick={toggle} aria-expanded={open} aria-controls={id}>{per} per page <ChevronDown size={14} /></button>}>
    {close => hrefs.map(h => <Link key={h.n} role="menuitem" className="k-menu-item" href={h.href} onClick={close}>{h.n} per page</Link>)}
  </Menu>;
}
