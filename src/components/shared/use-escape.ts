"use client";

import { useEffect, useRef } from "react";

/** Closes a hand-rolled dialog / sheet on Escape while it is open (WCAG 2.1.2 / APG dialog pattern).
 *  Only the most recently opened listener reacts, so a dialog stacked over another closes on its own. */
const stack: symbol[] = [];
export function useEscape(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  useEffect(() => { cb.current = onEscape; });
  useEffect(() => {
    if (!active) return;
    const id = Symbol("escape"); stack.push(id);
    const key = (e: KeyboardEvent) => { if (e.key !== "Escape" || e.defaultPrevented || stack[stack.length - 1] !== id) return; e.preventDefault(); cb.current(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); stack.splice(stack.indexOf(id), 1); };
  }, [active]);
}
