"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const slug = (t: string) => t.toLowerCase().replace(/^\d+[.)]\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** "On this page" rail for the legal documents (Q71: wide screens use the width for a contents column instead of an empty band
 *  beside a readable 80ch document). Built from the document's own <h2> headings after render; headings without an id get one
 *  from their text so the links work. Hidden below 1600px by legal.css. */
export function LegalToc() {
  const pathname = usePathname();
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    const hs = Array.from(document.querySelectorAll<HTMLHeadingElement>("#main h2"));
    const used = new Set<string>();
    const next = hs.map(h => {
      if (!h.id) { let id = slug(h.textContent ?? "") || "section"; while (used.has(id) || document.getElementById(id)) id += "-x"; h.id = id; }
      used.add(h.id);
      return { id: h.id, text: (h.textContent ?? "").trim() };
    });
    // DOM-derived after navigation: the headings only exist once the document has rendered
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(next);
  }, [pathname]);
  if (items.length < 2) return <aside className="lg-toc" aria-hidden="true" />;
  return <aside className="lg-toc"><nav aria-label="On this page"><b>On this page</b>
    <ol>{items.map(i => <li key={i.id}><a href={`#${i.id}`}>{i.text}</a></li>)}</ol></nav></aside>;
}
