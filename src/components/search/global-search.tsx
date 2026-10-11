"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import "@/styles/global-search.css";

type Hit = { kind: string; id: string; title: string; subtitle: string; link: string };
const GROUP: Record<string, string> = { event: "Events", person: "People", client: "Clients", venue: "Venues", service: "Services", provider: "Providers", booking: "Bookings", ticket: "Tickets", lead: "Leads", proposal: "Proposals", invoice: "Invoices", file: "Files" };

/**
 * First-class top-bar search (§95): ⌘K / Ctrl+K, grouped results, arrow-key navigation, Enter to open.
 * `seat` scopes workspace records (organizer/provider); personal records (tickets, own events) are always included.
 */
export function GlobalSearch({ seat, placeholder = "Search events, people, venues, bookings…" }: { seat?: string | null; placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(""), [hits, setHits] = useState<Hit[]>([]), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try { const r = await fetch(`/api/search?q=${encodeURIComponent(q)}${seat ? `&ws=${seat}` : ""}`, { signal: ctl.signal }); const j = await r.json(); setHits(j.results ?? []); setI(0); }
      catch { /* aborted */ } finally { setBusy(false); }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, seat]);
  const flat = q.trim().length < 2 ? [] : hits;
  const groups = useMemo(() => { const m = new Map<string, Hit[]>(); for (const h of flat) m.set(h.kind, [...(m.get(h.kind) ?? []), h]); return [...m.entries()]; }, [flat]);
  const go = (h: Hit) => { setOpen(false); setQ(""); router.push(h.link); };
  return <div className="gs" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
    <label className="gs-box"><Search size={16} aria-hidden="true" />
      <input ref={input} value={q} placeholder={placeholder} aria-label="Search" role="combobox" aria-expanded={open && flat.length > 0} aria-controls="gs-list" aria-autocomplete="list"
        aria-activedescendant={flat[i] ? `gs-${flat[i]!.kind}-${flat[i]!.id}` : undefined}
        onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(x + 1, flat.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(x - 1, 0)); }
          else if (e.key === "Enter" && flat[i]) { e.preventDefault(); go(flat[i]!); }
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
        }} />
      {busy ? <Loader2 size={15} className="mk-spin" aria-hidden="true" /> : <kbd>⌘K</kbd>}</label>
    {open && q.trim().length >= 2 && <div className="gs-panel" id="gs-list" role="listbox">
      {!flat.length && !busy ? <p className="gs-empty">No results for “{q}”.</p> : groups.map(([kind, list]) => <div key={kind} className="gs-group">
        <div className="gs-h">{GROUP[kind] ?? kind}</div>
        {list.map(h => { const idx = flat.indexOf(h); return <button key={`${h.kind}-${h.id}`} id={`gs-${h.kind}-${h.id}`} role="option" aria-selected={idx === i} type="button"
          className={idx === i ? "on" : ""} onMouseEnter={() => setI(idx)} onMouseDown={e => e.preventDefault()} onClick={() => go(h)}><b>{h.title}</b><small>{h.subtitle}</small></button>; })}
      </div>)}
    </div>}
  </div>;
}
