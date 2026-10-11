"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RotateCcw, SendHorizontal, Paperclip, Wrench, ChevronDown, ScrollText } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; queued?: string[]; unavailable?: boolean };
const PROMPTS = ["Review new enquiries", "Check availability this weekend", "Create a quote for a wedding", "Optimise pricing for next month"];

/** Gala Agent chat: answers from your workspace data; anything that would change data is queued for approval, never done directly. */
export function AgentChat({ initialGoal = "" }: { initialGoal?: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(initialGoal);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const send = async (q: string) => {
    const message = q.trim(); if (!message || busy) return;
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: "user", content: message }]); setText(""); setBusy(true);
    try {
      const res = await fetch("/api/agent/provider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history }) });
      const j = await res.json().catch(() => ({})) as { reply?: string; error?: string; queued?: string[]; unavailable?: boolean };
      setMsgs(m => [...m, { role: "assistant", content: j.reply ?? j.error ?? "Something went wrong.", queued: j.queued, unavailable: j.unavailable }]);
      if (j.queued?.length) router.refresh();
    } catch { setMsgs(m => [...m, { role: "assistant", content: "Couldn’t reach Gala Agent. Check your connection and try again." }]); }
    setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };
  return <section className="ws-panel pa-chat">
    <header><span className="pa-logo"><Sparkles aria-hidden="true" /></span><b>Gala Agent</b><em>Online</em>
      <button type="button" className="ws-btn outline sm" onClick={() => setMsgs([])}><RotateCcw aria-hidden="true" />New chat</button></header>
    <div className="pa-msgs" aria-live="polite">
      {!msgs.length && <><div className="pa-bot"><span className="pa-ava"><Sparkles aria-hidden="true" /></span><p>How can I help you today?</p></div>
        <div className="pa-bot pa-intro"><p>I can help you with:</p><ul><li>Responding to new opportunities</li><li>Checking and managing availability</li><li>Creating quotes and packages</li><li>Planning staffing and logistics</li><li>Preparing for upcoming events</li><li>Analysing performance and earnings</li></ul></div>
        <ul className="pa-prompts">{PROMPTS.map(p => <li key={p}><button type="button" onClick={() => send(p)}><ScrollText aria-hidden="true" />{p}</button></li>)}</ul></>}
      {msgs.map((m, i) => m.role === "user" ? <div key={i} className="pa-me"><p>{m.content}</p></div>
        : <div key={i} className={`pa-bot${m.unavailable ? " off" : ""}`}><span className="pa-ava"><Sparkles aria-hidden="true" /></span><div><p>{m.content}</p>
          {m.queued?.length ? <p className="pa-queued">{m.queued.length} action{m.queued.length === 1 ? "" : "s"} waiting for your approval: {m.queued.join(" · ")} — <Link href="/provider/agent?tab=approvals">Review</Link></p> : null}</div></div>)}
      {busy && <div className="pa-bot"><span className="pa-ava"><Sparkles aria-hidden="true" /></span><p className="pa-typing"><i /><i /><i /></p></div>}
      <div ref={end} />
    </div>
    <form className="pa-input" onSubmit={e => { e.preventDefault(); void send(text); }}>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Ask Gala Agent anything…" rows={2} maxLength={2000} aria-label="Message Gala Agent"
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
      <div><span className="ws-btn outline sm" aria-disabled="true" title="Attachments aren’t supported yet"><Paperclip aria-hidden="true" />Attach</span>
        <Link href="/provider/agent?tab=routines" className="ws-btn outline sm"><Wrench aria-hidden="true" />Tools<ChevronDown aria-hidden="true" /></Link>
        <button type="submit" className="pa-send" aria-label="Send" disabled={busy || !text.trim()}><SendHorizontal aria-hidden="true" /></button></div>
    </form>
  </section>;
}
