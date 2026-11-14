"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Clock3, X } from "lucide-react";
import "@/styles/global-search.css";
import { errorMessage, groupHits, groupLabel, isSearchable, moveActive, normaliseQuery, parseRecents, pushRecent, recentKey, searchUrl, shortcutLabel, type SearchHit } from "@/lib/search/global";

type Result = { key: string; hits: SearchHit[]; error: string | null };

/**
 * First-class top-bar search (§95, Q63): ⌘K / Ctrl+K, grouped results in visual keyboard order, Enter to open, recent results.
 * `seat` = a workspace id (organiser/provider: that workspace's records + the public marketplace), "admin" (platform records,
 * admin_global_search) or null (personal: own events, guests, bookings, tickets + public events and listings).
 * Stale responses never overwrite newer ones (abort + per-query result key); errors and "no results" are distinct states.
 */
export function GlobalSearch({ seat, placeholder = "Search events, people, venues, bookings…" }: { seat?: string | null; placeholder?: string }) {
  const router = useRouter();
  const base = useId().replace(/:/g, "");
  const listId = `${base}-list`;
  const [q, setQ] = useState(""), [open, setOpen] = useState(false), [active, setActive] = useState(0), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result>({ key: "", hits: [], error: null });
  const [recents, setRecents] = useState<SearchHit[]>([]), [kbd, setKbd] = useState("⌘K");
  const input = useRef<HTMLInputElement>(null);
  const nq = normaliseQuery(q), searchable = isSearchable(q), key = `${seat ?? ""}|${nq}`;
  const settled = searchable && result.key === key, loading = searchable && !settled;

  useEffect(() => { queueMicrotask(() => setKbd(shortcutLabel(navigator.platform || navigator.userAgent))); }, []);
  useEffect(() => {
    // Every mounted instance listens (desktop bar + phone row); only a visible one takes the shortcut, and only once.
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      const el = input.current;
      if (!el || el.getClientRects().length === 0) return;
      e.preventDefault(); el.focus(); el.select(); setOpen(true);
    };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!searchable) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(searchUrl(nq, seat), { signal: ctl.signal, headers: { accept: "application/json" } });
        const j = await r.json().catch(() => ({})) as { results?: SearchHit[] };
        if (ctl.signal.aborted) return;
        setResult(r.ok ? { key, hits: Array.isArray(j.results) ? j.results : [], error: null } : { key, hits: [], error: errorMessage(r.status) });
        setActive(0);
      } catch {
        if (!ctl.signal.aborted) { setResult({ key, hits: [], error: errorMessage(0) }); setActive(0); }
      }
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [key, nq, seat, searchable, retry]);

  const { groups, flat } = useMemo(() => {
    if (!searchable) return { groups: recents.length ? [{ kind: "recent", label: "Recent", hits: recents }] : [], flat: recents };
    // While a newer query loads, keep showing the last results (dimmed) instead of flashing "No results"; Enter waits for them.
    return result.error ? { groups: [], flat: [] } : groupHits(result.hits);
  }, [searchable, recents, result]);
  const current = active >= 0 && active < flat.length ? flat[active] : undefined;
  const showPanel = open && (searchable || recents.length > 0);
  const optionId = (idx: number) => `${base}-o-${idx}`;

  const loadRecents = () => { try { setRecents(parseRecents(localStorage.getItem(recentKey(seat)))); } catch { setRecents([]); } };
  const remember = (h: SearchHit) => { try { localStorage.setItem(recentKey(seat), JSON.stringify(pushRecent(parseRecents(localStorage.getItem(recentKey(seat))), h))); } catch { /* storage unavailable */ } };
  const clearRecents = () => { try { localStorage.removeItem(recentKey(seat)); } catch { /* storage unavailable */ } setRecents([]); input.current?.focus(); };
  const go = (h: SearchHit) => { remember(h); setOpen(false); setQ(""); input.current?.blur(); router.push(h.link); };

  const status = !searchable ? "" : result.error && settled ? result.error : loading ? "Searching…" : flat.length ? `${flat.length} result${flat.length === 1 ? "" : "s"}` : `No results for ${nq}`;

  return <div className="gs" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
    <label className="gs-box"><Search size={16} aria-hidden="true" />
      <input ref={input} value={q} placeholder={placeholder} aria-label="Search" role="combobox" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={80}
        aria-expanded={showPanel} aria-controls={listId} aria-autocomplete="list" aria-haspopup="listbox"
        aria-activedescendant={showPanel && current ? optionId(active) : undefined}
        onFocus={() => { loadRecents(); setOpen(true); }} onChange={e => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) { setOpen(true); return; } setActive(x => moveActive(x, e.key === "ArrowDown" ? 1 : -1, flat.length)); }
          else if (e.key === "Home" && showPanel && flat.length) { e.preventDefault(); setActive(0); }
          else if (e.key === "End" && showPanel && flat.length) { e.preventDefault(); setActive(flat.length - 1); }
          else if (e.key === "Enter") { e.preventDefault(); if (showPanel && current && (!searchable || settled)) go(current); }
          else if (e.key === "Escape") {
            // First Escape closes the panel (and stops the phone search row closing too); the next one clears / leaves.
            if (showPanel) { e.preventDefault(); e.stopPropagation(); setOpen(false); } else if (q) { e.preventDefault(); e.stopPropagation(); setQ(""); }
          }
          else if (e.key === "Tab") setOpen(false);
        }} />
      {loading ? <Loader2 size={15} className="gs-spin" aria-hidden="true" /> : q ? <button type="button" className="gs-clear" aria-label="Clear search" onMouseDown={e => e.preventDefault()} onClick={() => { setQ(""); input.current?.focus(); }}><X size={14} aria-hidden="true" /></button> : <kbd aria-hidden="true">{kbd}</kbd>}</label>
    <span className="sr-only" role="status" aria-live="polite">{open ? status : ""}</span>
    {showPanel && <div className={`gs-panel${loading && flat.length ? " is-stale" : ""}`} id={listId} role="listbox" aria-label={searchable ? `Results for ${nq}` : "Recent results"} aria-busy={loading}>
      {searchable && settled && result.error ? <div className="gs-empty gs-error" role="presentation">{result.error}<button type="button" className="gs-retry" onMouseDown={e => e.preventDefault()} onClick={() => { setResult({ key: "", hits: [], error: null }); setRetry(n => n + 1); }}>Try again</button></div>
        : searchable && !flat.length ? <p className="gs-empty" role="presentation">{loading ? "Searching…" : <>No results for “{nq}”. Check the spelling or try fewer words.</>}</p>
        : groups.map(g => <div key={g.kind} className="gs-group" role="group" aria-labelledby={`${base}-g-${g.kind}`}>
          <div className="gs-h" id={`${base}-g-${g.kind}`} role="presentation">{g.kind === "recent" ? <><Clock3 size={11} aria-hidden="true" /> Recent<button type="button" className="gs-clear-recent" onMouseDown={e => e.preventDefault()} onClick={clearRecents}>Clear</button></> : g.label}</div>
          {g.hits.map(h => { const idx = flat.indexOf(h); return <div key={`${h.kind}-${h.id}`} id={optionId(idx)} role="option" aria-selected={idx === active}
            className={`gs-opt${idx === active ? " on" : ""}`} onMouseMove={() => { if (idx !== active) setActive(idx); }} onMouseDown={e => e.preventDefault()} onClick={() => go(h)}>
            <b>{h.title}</b><small>{g.kind === "recent" ? `${groupLabel(h.kind)}${h.subtitle ? ` · ${h.subtitle}` : ""}` : h.subtitle}</small></div>; })}
        </div>)}
    </div>}
  </div>;
}
