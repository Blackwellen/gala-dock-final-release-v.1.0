"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Public event page section tabs. "Overview" (id `about`) shows the whole page; every other tab shows only its own section,
 * so pressing a tab visibly changes the page. "Tickets" brings the ticket card into the main view. The chosen tab is kept in
 * the URL hash (shareable, back/forward), and in-page links such as "View line-up" or "#photos" open the tab that holds their
 * target before scrolling to it. Panels are server-rendered elements marked `data-panel` inside `.pe3-body`; without JS the
 * page stays the full single page with working anchors.
 */
export function EventTabs({ tabs }: { tabs: [string, string][] }) {
  const ids = tabs.map(t => t[0]);
  const overview = ids.includes("about") ? "about" : null;
  const [active, setActive] = useState<string>(overview ?? "all");
  const nav = useRef<HTMLElement>(null);

  const apply = useCallback((id: string) => {
    const body = document.querySelector<HTMLElement>(".pe3-body");
    if (!body) return;
    const all = id === "all" || id === "about";
    body.dataset.tab = all ? "all" : id;
    body.querySelectorAll<HTMLElement>("[data-panel]").forEach(p => { p.hidden = !all && p.dataset.panel !== id && p.dataset.panel !== "rail"; });
    setActive(all ? (overview ?? "all") : id);
  }, [overview]);

  /** Scroll so the tab bar sits just under the sticky site header (only when the reader is already below it). */
  const toTop = () => {
    const el = nav.current; if (!el) return;
    const head = document.querySelector<HTMLElement>(".gp-header, header")?.getBoundingClientRect().height ?? 0;
    const y = el.getBoundingClientRect().top + window.scrollY - head - 4;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  /** Open whichever tab holds `hash` (a tab id or any element id inside a panel) and scroll to it. */
  const open = useCallback((hash: string, scroll: boolean) => {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) { apply("all"); return false; }
    if (ids.includes(id)) { apply(id); return true; }
    const target = document.getElementById(id);
    const panel = target?.closest<HTMLElement>("[data-panel]")?.dataset.panel;
    if (!target || !panel) return false;
    apply(panel === "rail" ? "tickets" : ids.includes(panel) ? panel : "all");
    if (scroll) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    return true;
  }, [apply, ids]);

  useEffect(() => {
    // Initial tab from the URL, after paint (the server renders the full Overview).
    const first = requestAnimationFrame(() => { if (location.hash) open(location.hash, true); });
    const onHash = () => open(location.hash, true);
    // In-page anchors anywhere on the event page (hero CTAs, thumbnails, "View full schedule", highlights banner).
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!a || !a.closest(".pe3") || a.closest(".pe3-tabs") || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const h = a.getAttribute("href") ?? "";
      if (h.length > 1 && open(h, true)) { e.preventDefault(); history.pushState(null, "", h); }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    document.addEventListener("click", onClick);
    return () => { cancelAnimationFrame(first); window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onHash); document.removeEventListener("click", onClick); };
  }, [open]);

  const choose = (id: string) => {
    apply(id);
    history.pushState(null, "", id === overview ? location.pathname + location.search : `#${id}`);
    toTop();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (n < 0 && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const k = (n + tabs.length) % tabs.length;
    choose(tabs[k][0]);
    nav.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[k]?.focus();
  };

  return <nav ref={nav} className="pe3-tabs" aria-label="Event sections">
    <div role="tablist" aria-label="Event sections">
      {tabs.map(([id, label], i) => {
        const on = active === id || (active === "all" && i === 0 && !overview);
        return <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={on} tabIndex={on ? 0 : -1}
          className={on ? "on" : ""} onClick={() => choose(id)} onKeyDown={e => onKey(e, i)}>{label}</button>;
      })}
    </div>
  </nav>;
}
