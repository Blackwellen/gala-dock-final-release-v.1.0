"use client";

import { useEffect } from "react";

/** Every dropdown / popover surface in the app (kit Menu, shell menus, admin, studio, search, plan editor). */
const SELECTOR = [
  ".k-pop", ".pv-menu-panel", ".ws-pop-panel", ".pt-pop-panel", ".aa-menu-panel", ".adb-menu-panel", ".adb-pop-body", ".gs-panel",
  ".pb-menu", ".dm-menu", ".dk-pop", ".mb-menu", ".mb-pop", ".st-pop", "[data-popover]",
].join(",");
const GAP = 8, MIN_H = 140;

/** Nearest box the popover can't escape: the viewport, narrowed by any ancestor that clips its overflow. */
function bounds(el: HTMLElement) {
  let top = 0, left = 0, right = window.innerWidth, bottom = window.innerHeight;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(hidden|auto|scroll|clip)/.test(cs.overflowX + cs.overflowY)) { const r = p.getBoundingClientRect(); top = Math.max(top, r.top); left = Math.max(left, r.left); right = Math.min(right, r.right); bottom = Math.min(bottom, r.bottom); }
  }
  return { top: top + GAP, left: left + GAP, right: right - GAP, bottom: bottom - GAP };
}

/** Keeps an open popover fully on screen: flips it above its trigger when there's more room there, caps its height so the
 *  content scrolls inside, and nudges it sideways. Uses `translate` / inline insets only, so framer-motion's transform is untouched. */
function fit(el: HTMLElement) {
  if (!el.isConnected || el.offsetParent === null) return;
  const s = el.style, keep = el.scrollTop;
  // Undo the previous fit before measuring the natural size.
  if (el.dataset.fit) { s.maxHeight = ""; s.translate = ""; if (el.dataset.fit === "up") { s.top = el.dataset.fitTop ?? ""; s.bottom = el.dataset.fitBottom ?? ""; } }
  const r = el.getBoundingClientRect(); if (!r.height || !r.width) return;
  const zoom = el.offsetHeight ? r.height / el.offsetHeight : 1;
  const b = bounds(el);
  const anchor = (el.offsetParent as HTMLElement).getBoundingClientRect();
  const pointAnchored = !!s.top && /px$/.test(s.top) && !el.dataset.fitTop; // context menus placed at the cursor
  let mode = "down", avail = b.bottom - r.top;
  if (r.bottom > b.bottom) {
    const below = b.bottom - anchor.bottom, above = anchor.top - b.top;
    if (!pointAnchored && above > below && r.height > below) {
      el.dataset.fitTop = s.top; el.dataset.fitBottom = s.bottom;
      s.top = "auto"; s.bottom = "calc(100% + 6px)"; mode = "up"; avail = above - 6;
    } else if (pointAnchored) {
      const lift = Math.min(r.bottom - b.bottom, r.top - b.top); s.translate = `0 ${-lift / zoom}px`; avail = b.bottom - (r.top - lift);
    }
  }
  if (r.height > avail) { s.maxHeight = `${Math.max(MIN_H, avail) / zoom}px`; s.overflowY = "auto"; }
  const dx = r.right > b.right ? b.right - r.right : r.left < b.left ? b.left - r.left : 0;
  if (dx) s.translate = `${dx / zoom}px ${s.translate.split(" ")[1] ?? "0"}`;
  el.dataset.fit = mode; el.scrollTop = keep;
}

/** Mounted once in the root layout: fits popovers as they open, and again on resize / scroll while open. */
export function PopoverFit() {
  useEffect(() => {
    const open = new Set<HTMLElement>();
    const scan = (root: ParentNode) => { const found = root instanceof HTMLElement && root.matches(SELECTOR) ? [root] : []; found.push(...Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))); for (const el of found) { open.add(el); requestAnimationFrame(() => fit(el)); } };
    const mo = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "attributes") { const t = m.target as HTMLElement; if (t.matches?.("details[open]")) scan(t); continue; }
        m.addedNodes.forEach(n => { if (n instanceof HTMLElement) scan(n); });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    let raf = 0;
    const refit = (e?: Event) => { if (e?.type === "scroll" && e.target instanceof Element && e.target.closest(SELECTOR)) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { for (const el of open) { if (!el.isConnected) open.delete(el); else fit(el); } }); };
    addEventListener("resize", refit); addEventListener("scroll", refit, true);
    return () => { mo.disconnect(); removeEventListener("resize", refit); removeEventListener("scroll", refit, true); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
