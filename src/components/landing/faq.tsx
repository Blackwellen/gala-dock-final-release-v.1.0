"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";

export type FaqItem = { q: string; a: string };

/** Single-open accordion. Each trigger is a real button with aria-expanded/aria-controls. */
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="lp-faq-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${base}-panel-${i}`;
        const buttonId = `${base}-button-${i}`;
        return (
          <div className={`lp-faq-item${isOpen ? " is-open" : ""}`} key={item.q}>
            <h3>
              <button id={buttonId} type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? null : i)}>
                <span>{item.q}</span>
                <Plus size={18} aria-hidden="true" />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} className="lp-faq-panel" hidden={!isOpen}>
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
