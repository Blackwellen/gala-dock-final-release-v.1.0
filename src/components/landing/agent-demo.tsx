"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Sparkles, Check, ArrowUp } from "lucide-react";

const prompts = [
  {
    tab: "Shortlist venues",
    ask: "Find three rooftop venues for a 120-guest product launch in late spring.",
    answer: "Here are three venues that match your capacity and date window. I've flagged which ones include in-house catering and AV.",
    items: ["Riverside terrace · seats 150 · catering included", "Skyline loft · seats 130 · AV package available", "Harbour pavilion · seats 180 · step-free access"],
  },
  {
    tab: "Draft a budget",
    ask: "Draft a budget for a 200-person charity gala with a live band.",
    answer: "I've split the draft into venue, catering, entertainment, production and contingency. You can adjust every line before sharing it with your team.",
    items: ["Venue & catering grouped per guest", "Entertainment and production as fixed lines", "10% contingency held back by default"],
  },
  {
    tab: "Reply to an enquiry",
    ask: "Help me reply to a wedding enquiry asking about September availability.",
    answer: "Here's a draft reply using your listed availability and packages. Nothing is sent until you review and approve it.",
    items: ["Confirms two open Saturdays", "Links your package brochure", "Suggests a viewing slot"],
  },
];

/** Illustrative Gala Agent conversation with keyboard-accessible tabs. */
export function AgentDemo() {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const p = prompts[active];

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    let next = active;
    if (e.key === "ArrowRight") next = (active + 1) % prompts.length;
    else if (e.key === "ArrowLeft") next = (active - 1 + prompts.length) % prompts.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = prompts.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="lp-agent-demo">
      <div className="lp-agent-tabs" role="tablist" aria-label="Example requests">
        {prompts.map((item, i) => (
          <button
            key={item.tab}
            ref={el => { refs.current[i] = el; }}
            id={`${base}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`${base}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKey}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div className="lp-agent-window" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} aria-live="polite">
        <div className="lp-agent-msg lp-agent-user"><p>{p.ask}</p></div>
        <div className="lp-agent-msg lp-agent-bot">
          <span className="lp-agent-avatar" aria-hidden="true"><Sparkles size={16} /></span>
          <div>
            <p>{p.answer}</p>
            <ul>{p.items.map(it => <li key={it}><Check size={14} aria-hidden="true" />{it}</li>)}</ul>
          </div>
        </div>
        <div className="lp-agent-input" aria-hidden="true">
          <span>Ask Gala Agent anything about your event…</span>
          <span className="lp-agent-send"><ArrowUp size={16} /></span>
        </div>
        <p className="lp-agent-note">Example conversation for illustration. Gala Agent suggests; you stay in control of every decision.</p>
      </div>
    </div>
  );
}
