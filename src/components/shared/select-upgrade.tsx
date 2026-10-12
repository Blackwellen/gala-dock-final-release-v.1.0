"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";

type Opt = { value: string; label: string; disabled: boolean; group: string | null; index: number };
type Open = { select: HTMLSelectElement; opts: Opt[]; host: HTMLElement; n: number };

/** Selects that keep the platform picker: multi-selects, list boxes, opted-out ones, and touch devices (native sheets suit touch). */
const eligible = (el: EventTarget | null): el is HTMLSelectElement =>
  el instanceof HTMLSelectElement && !el.multiple && el.size <= 1 && !el.disabled && !el.hasAttribute("data-native") && matchMedia("(pointer: fine)").matches;

function readOptions(s: HTMLSelectElement): Opt[] {
  return Array.from(s.options).map((o, index) => ({ value: o.value, label: o.label || o.text, disabled: o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled), group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null, index }))
    .filter(o => !(o.disabled && o.value === "" && o.index === 0 && s.required)); // hide a disabled required placeholder
}

/** Sets the value the way a user would, so React's onChange and form libraries see a real change event. */
function choose(s: HTMLSelectElement, value: string) {
  if (s.value === value) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(s, value);
  s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * App-wide premium dropdown for every native <select> (desktop pointers): replaces the OS list with a styled, searchable,
 * keyboard-accessible listbox that stays on screen. The <select> remains the source of truth (value, form submit, onChange).
 */
export function SelectUpgrade() {
  const [open, setOpen] = useState<Open | null>(null);
  const cur = useRef<HTMLSelectElement | null>(null), seq = useRef(0);
  const close = useCallback(() => { cur.current = null; setOpen(null); }, []);
  const show = useCallback((s: HTMLSelectElement) => {
    const host = (s.closest(".k-root, .ws-app, .pt-app") as HTMLElement | null) ?? document.body;
    cur.current = s; seq.current += 1; setOpen({ select: s, opts: readOptions(s), host, n: seq.current });
  }, []);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (e.button !== 0 || !eligible(e.target)) return; e.preventDefault(); const s = e.target; s.focus(); if (cur.current === s) close(); else show(s); };
    const key = (e: KeyboardEvent) => {
      if (!eligible(e.target)) return;
      const k = e.key;
      if (k === "Escape" && cur.current === e.target) { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if ((e.altKey && (k === "ArrowDown" || k === "ArrowUp")) || k === "F4" || k === " " || (k === "Enter" && !e.target.form)) { e.preventDefault(); show(e.target); }
    };
    document.addEventListener("mousedown", down, true); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", key, true); };
  }, [show, close]);
  if (!open) return null;
  return createPortal(<SelectList key={open.n} {...open} onClose={(refocus) => { close(); if (refocus) open.select.focus(); }} />, open.host);
}

function SelectList({ select, opts, host, onClose }: Omit<Open, "n"> & { onClose: (refocus: boolean) => void }) {
  const pop = useRef<HTMLDivElement>(null), listRef = useRef<HTMLUListElement>(null), searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(""), [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", opacity: 0 });
  const searchable = opts.length > 9;
  const shown = useMemo(() => { const t = q.trim().toLowerCase(); return t ? opts.filter(o => `${o.label} ${o.group ?? ""}`.toLowerCase().includes(t)) : opts; }, [q, opts]);
  const selectable = shown.filter(o => !o.disabled);
  const [active, setActive] = useState(() => Math.max(0, selectable.findIndex(o => o.index === select.selectedIndex)));
  const typed = useRef({ s: "", t: 0 });
  const id = `sx-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const label = select.getAttribute("aria-label") || select.labels?.[0]?.textContent?.trim() || select.name || "Options";

  // Place under (or above) the select, as wide as it (min 200px), height capped to the room left; zoom-aware for the shells.
  const place = useCallback(() => {
    const z = parseFloat(getComputedStyle(host).zoom || "1") || 1, r = select.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, gap = 8;
    const natural = pop.current ? pop.current.scrollHeight * z : 320;
    const below = vh - r.bottom - gap - 4, above = r.top - gap - 4, up = natural > below && above > below;
    const w = Math.max(r.width, 200 * z), left = Math.min(Math.max(gap, r.left), vw - gap - w);
    const avail = Math.min(Math.max(150, up ? above : below), 380 * z);
    setStyle({ position: "fixed", left: left / z, width: w / z, maxHeight: avail / z, zIndex: 1200, ...(up ? { bottom: (vh - r.top + 4) / z } : { top: (r.bottom + 4) / z }) });
  }, [host, select]);
  useEffect(() => { place(); const raf = requestAnimationFrame(place); (searchable ? searchRef.current : listRef.current)?.focus({ preventScroll: true }); return () => cancelAnimationFrame(raf); }, [place, searchable]);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && e.target !== select) onClose(false); };
    const moved = (e: Event) => { if (e.target instanceof Node && pop.current?.contains(e.target)) return; onClose(false); };
    // If the select goes away (its dialog closed, the page changed), the list goes with it.
    const gone = new MutationObserver(() => { if (!select.isConnected) onClose(false); }); gone.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("mousedown", out); addEventListener("resize", moved); addEventListener("scroll", moved, true);
    return () => { gone.disconnect(); document.removeEventListener("mousedown", out); removeEventListener("resize", moved); removeEventListener("scroll", moved, true); };
  }, [onClose, select]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, shown]);

  const pick = (o: Opt | undefined) => { if (!o || o.disabled) return; choose(select, o.value); onClose(true); };
  const onKey = (e: React.KeyboardEvent) => {
    const n = selectable.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(n - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); } else if (e.key === "End") { e.preventDefault(); setActive(n - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); setActive(a => Math.min(n - 1, a + 8)); } else if (e.key === "PageUp") { e.preventDefault(); setActive(a => Math.max(0, a - 8)); }
    else if (e.key === "Enter" || (e.key === " " && !searchable)) { e.preventDefault(); pick(selectable[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onClose(true); } // don't also close a surrounding dialog
    else if (e.key === "Tab") onClose(false);
    else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { // type-ahead
      const now = Date.now(); typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : "") + e.key.toLowerCase(), t: now };
      const hit = selectable.findIndex(o => o.label.toLowerCase().startsWith(typed.current.s)); if (hit >= 0) setActive(hit);
    }
  };
  return <div ref={pop} className="sx-pop" style={style} onKeyDown={onKey}>
    {searchable && <label className="sx-search"><Search size={14} aria-hidden="true" /><input ref={searchRef} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder="Search…" aria-label={`Search ${label}`} aria-controls={id} aria-activedescendant={selectable[active] ? `${id}-${selectable[active].index}` : undefined} /></label>}
    <ul ref={listRef} id={id} role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={selectable[active] ? `${id}-${selectable[active].index}` : undefined}>
      {shown.map((o, oi) => { const head = o.group && o.group !== (shown[oi - 1]?.group ?? null) ? o.group : null; const ai = selectable.indexOf(o), sel = o.index === select.selectedIndex;
        return <li key={o.index} role="presentation">{head && <span className="sx-group" role="presentation">{head}</span>}
          <div id={`${id}-${o.index}`} role="option" aria-selected={sel} aria-disabled={o.disabled || undefined} data-i={ai} className={`sx-opt${ai === active ? " on" : ""}${sel ? " sel" : ""}`}
            onMouseEnter={() => ai >= 0 && setActive(ai)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}><span>{o.label || " "}</span>{sel && <Check size={15} aria-hidden="true" />}</div></li>; })}
      {!shown.length && <li className="sx-empty">No matches</li>}
    </ul>
  </div>;
}
