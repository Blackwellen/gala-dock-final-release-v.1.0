"use client";

import { useEffect } from "react";

/** R1: any text cut short with an ellipsis (names in admin / list rows, chips, the workspace switcher) shows its full wording as a
 *  native tooltip when pointed at or focused. Set lazily on pointerover / focusin, only when the text really overflows and the
 *  element has no title of its own — no layout reads until someone interacts. Mounted once in the root layout. */
export function TruncationTitle() {
  useEffect(() => {
    const mark = (e: Event) => {
      for (let n = e.target as Element | null, d = 0; n instanceof HTMLElement && d < 4; n = n.parentElement, d++) {
        if (n.hasAttribute("title") || n.dataset.tt === "1") continue;
        if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).textOverflow === "ellipsis") {
          const text = n.textContent?.replace(/\s+/g, " ").trim();
          if (text) { n.title = text; n.dataset.tt = "1"; }
        }
      }
    };
    document.addEventListener("pointerover", mark, { passive: true });
    document.addEventListener("focusin", mark);
    return () => { document.removeEventListener("pointerover", mark); document.removeEventListener("focusin", mark); };
  }, []);
  return null;
}
