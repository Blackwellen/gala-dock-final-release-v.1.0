"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Bot, Check, CircleCheck, Copy, Globe, KeyRound, RotateCcw, Server, ShieldCheck, ShieldX, Webhook, Workflow, type LucideIcon } from "lucide-react";
import { HREF } from "@/lib/public/site";
import { TLink } from "../tracked-link";
import { useActivated } from "../motion";
import { TabBar, panelProps } from "../controls";
import { cx } from "../ui";
import { trackPublic } from "../track";

const S = "developers";

/* ── 6.2 Three ways to integrate: one console ─────────────────────────────────────────────────────────────────────────────
   Snippets mirror the implemented contract: Bearer gd_(live|test)_ keys, GET /api/v1/events (feed:read, cursor feed), the MCP
   JSON-RPC endpoint /api/mcp with tools such as events.list, and signed webhooks (Gala-Signature t=…,v1=…; Gala-Event-Id). */
type P = "rest" | "mcp" | "webhooks";
const SNIPPETS: Record<P, { title: string; lang: string; req: string; resLabel: string; res: string; doc: string }> = {
  rest: { title: "REST API", lang: "bash", resLabel: "200 OK · application/json",
    req: `curl https://www.galadock.com/api/v1/events?limit=2 \\
  -H "Authorization: Bearer gd_live_xxxxxxxx_…" \\
  -H "Gala-Api-Version: 2026-10-29"`,
    res: `{
  "data": [
    { "id": "evt_…", "type": "booking.confirmed", "cursor": "1041",
      "data": { "item_id": "…", "event_id": "…", "status": "confirmed",
                "amount": …, "currency": "GBP" } },
    { "id": "evt_…", "type": "ticket.order.paid", "cursor": "1042", "data": { … } }
  ],
  "next_cursor": "1042",
  "api_version": "2026-10-29"
}`, doc: "GET /api/v1/events — cursor feed (feed:read)" },
  mcp: { title: "MCP", lang: "json", resLabel: "JSON-RPC result",
    req: `POST /api/mcp
Authorization: Bearer gd_live_xxxxxxxx_…

{ "jsonrpc": "2.0", "id": 7, "method": "tools/call",
  "params": { "name": "events.list", "arguments": {} } }`,
    res: `{
  "jsonrpc": "2.0", "id": 7,
  "result": {
    "content": [{ "type": "text",
      "text": "[{\\"id\\":\\"…\\",\\"name\\":\\"Summer Sessions\\", …}]" }],
    "isError": false
  }
}`, doc: "tools/list returns only what the key’s scopes allow" },
  webhooks: { title: "Webhooks", lang: "http", resLabel: "Your endpoint replies 2xx",
    req: `POST https://your-app.example/hooks/gala
Gala-Event-Id: 9b1c…
Gala-Event-Type: booking.confirmed
Gala-Signature: t=1784822400,v1=5f2a…

{ "id": "9b1c…", "type": "booking.confirmed",
  "data": { "item_id": "…", "event_id": "…", "listing_id": "…",
            "status": "confirmed", "amount": …, "currency": "GBP" } }`,
    res: `// Verify HMAC-SHA256 over "<t>.<raw body>",
// reject if |now − t| > 300 s, then dedupe on Gala-Event-Id.
HTTP/1.1 200 OK`, doc: "Retries with backoff; replay from Settings → Developers" },
};

export function DevConsole() {
  const [p, setP] = useState<P>("rest");
  const [copied, setCopied] = useState(false);
  // Deep links from the footer (#mcp, #webhooks) open the matching tab.
  useEffect(() => {
    const sync = () => { const h = window.location.hash.slice(1); if (h === "mcp" || h === "webhooks") setP(h); else if (h === "interfaces" || h === "rest") setP("rest"); };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const set = (k: P) => { setP(k); setCopied(false); trackPublic("section_interaction", S, `console_${k}`); };
  const copy = async () => { try { await navigator.clipboard.writeText(SNIPPETS[p].req); setCopied(true); setTimeout(() => setCopied(false), 2400); } catch { setCopied(false); } };
  const items = [{ key: "rest" as const, label: "REST API", icon: Globe }, { key: "mcp" as const, label: "MCP", icon: Bot }, { key: "webhooks" as const, label: "Webhooks", icon: Webhook }];
  return <div className="gpd-console">
    <span id="mcp" className="gpd-anchor" aria-hidden="true" /><span id="webhooks" className="gpd-anchor" aria-hidden="true" />
    <TabBar idBase="gpd-proto" label="Integration interface" items={items} value={p} onChange={set} className="gpd-proto-tabs" />
    {items.map(it => { const sn = SNIPPETS[it.key]; const on = it.key === p; return <div key={it.key} {...panelProps("gpd-proto", it.key, on)} className="gpd-panel">
      <div className="gpd-pane">
        <div className="gpd-pane-h"><span>Request</span><span className="gpd-lang">{sn.lang}</span>
          <button type="button" className="gpd-copy" onClick={copy} aria-label={`Copy the ${sn.title} example`}>{copied && on ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied && on ? "Copied" : "Copy"}</button></div>
        {on ? <motion.pre tabIndex={0} aria-label={`${sn.title} request example`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}><code>{sn.req}</code></motion.pre> : <pre tabIndex={0} aria-label={`${sn.title} request example`}><code>{sn.req}</code></pre>}
      </div>
      <div className="gpd-pane is-out">
        <div className="gpd-pane-h"><span>{sn.resLabel}</span></div>
        {on ? <motion.pre tabIndex={0} aria-label={`${sn.title} response example`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25, delay: .08 }}><code>{sn.res}</code></motion.pre> : <pre tabIndex={0} aria-label={`${sn.title} response example`}><code>{sn.res}</code></pre>}
      </div>
      <p className="gpd-doc"><code>{sn.doc}</code><TLink href={HREF.docs} event="developer_docs_open" surface={S} variant={`console_${it.key}`} className="gp-link">Reference</TLink></p>
    </div>; })}
    <p className="gp-sr" role="status" aria-live="polite">{copied ? "Example copied to the clipboard." : ""}</p>
  </div>;
}

/* ── 6.3 PolicyGateway ─────────────────────────────────────────────────────────────────────────────────────────────────── */
const INPUTS: [string, LucideIcon][] = [["Web app", Globe], ["Gala Agent", Bot], ["API", KeyRound], ["MCP", Server]];
const EXAMPLES = [
  { key: "list", label: "List events", from: "API", scope: "events:read", to: "Events", ok: true, out: "200 · events returned for the key’s workspace" },
  { key: "hold", label: "Ask a caterer to hold a date", from: "MCP", scope: "marketplace:write", to: "Marketplace", ok: true, out: "Hold requested — the provider confirms in their workspace" },
  { key: "tickets", label: "Read ticket sales", from: "Gala Agent", scope: "tickets:read", to: "Tickets", ok: true, out: "200 · same permissions as the person who created the key" },
  { key: "commit", label: "Confirm a booking payment", from: "API", scope: "bookings:write", to: "Bookings", ok: false, out: "403 approval_required — a person approves commitments in the app" },
];
export function Gateway() {
  const [ex, setEx] = useState("list");
  const e = EXAMPLES.find(x => x.key === ex)!;
  return <div className="gpd-gw">
    <div className="gpd-gw-ex" role="group" aria-label="Example request">
      {EXAMPLES.map(x => <button key={x.key} type="button" className="gp-pill" aria-pressed={ex === x.key} onClick={() => { setEx(x.key); trackPublic("section_interaction", S, `gateway_${x.key}`); }}>{x.ok ? <ShieldCheck size={15} aria-hidden="true" /> : <ShieldX size={15} aria-hidden="true" />}{x.label}</button>)}
    </div>
    <div className="gpd-gw-diagram gp-panel" aria-hidden="true">
      <ul className="gpd-gw-in">{INPUTS.map(([n, I]) => <li key={n} className={cx(e.from === n && "is-on")}><I size={18} />{n}</li>)}</ul>
      <div className={cx("gpd-gw-core", !e.ok && "is-deny")}>
        <ShieldCheck size={26} />
        <b>Policy gateway</b>
        <span>Key scope · person’s role · approval rules · rate limit</span>
        <AnimatePresence mode="wait"><motion.code key={e.key} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>{e.scope}</motion.code></AnimatePresence>
      </div>
      <ul className="gpd-gw-out">{["Events", "Tickets", "Bookings", "Marketplace"].map(n => <li key={n} className={cx(e.to === n && (e.ok ? "is-on" : "is-deny"))}>{n}</li>)}</ul>
      <motion.span key={e.key} className={cx("gpd-gw-pulse", !e.ok && "is-deny")} initial={{ scaleX: 0 }} animate={{ scaleX: e.ok ? 1 : .55 }} transition={{ duration: .9, ease: [0.2, 0.7, 0.2, 1] }} />
    </div>
    <p className={cx("gpd-gw-result", !e.ok && "is-deny")} aria-live="polite">{e.ok ? <CircleCheck size={17} aria-hidden="true" /> : <ShieldX size={17} aria-hidden="true" />}<span><b>{e.from} → {e.to}</b> · <code>{e.scope}</code> · {e.out}</span></p>
    <p className="gpd-gw-audit"><Workflow size={16} aria-hidden="true" />Every call is written to the audit log with a request ID, the key, the tool and the result.</p>
  </div>;
}

/* ── 6.4 Event stream ──────────────────────────────────────────────────────────────────────────────────────────────────── */
const STREAM = ["event.created", "booking.requested", "booking.confirmed", "event.published", "ticket.order.paid", "review.published"];
type Delivery = { type: string; attempt: number; status: string; tone: "ok" | "wait" };
export function EventStream() {
  const [ref, on] = useActivated<HTMLDivElement>(0.35);
  const [n, setN] = useState(0);
  const [run, setRun] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!on) return;
    const ids = Array.from({ length: STREAM.length + 1 }, (_, i) => setTimeout(() => setN(i + 1), 500 + i * 900));
    return () => ids.forEach(clearTimeout);
  }, [on, run]);
  const deliveries: Delivery[] = [];
  STREAM.slice(0, Math.min(n, STREAM.length)).forEach(t => {
    if (t === "ticket.order.paid") { deliveries.push({ type: t, attempt: 1, status: "503 · retry in 1 min", tone: "wait" }); if (n > STREAM.indexOf(t) + 1) deliveries.push({ type: t, attempt: 2, status: "200 OK", tone: "ok" }); }
    else deliveries.push({ type: t, attempt: 1, status: "200 OK", tone: "ok" });
  });
  return <div ref={ref} className="gpd-stream">
    <ol className="gpd-stream-line" aria-label="Webhook event types in order">
      {STREAM.map((t, i) => <li key={t} className={cx(i < n && "is-sent", i === n - 1 && "is-on")}><i aria-hidden="true" /><code>{t}</code></li>)}
    </ol>
    <div className="gpd-endpoint gp-card">
      <p className="gpd-endpoint-h"><Server size={18} aria-hidden="true" /><b>Your endpoint</b><code>https://your-app.example/hooks/gala</code></p>
      <LayoutGroup><ul className="gpd-history" aria-live="polite">
        <AnimatePresence initial={false}>{deliveries.slice().reverse().slice(0, 5).map(d => <motion.li layout key={`${d.type}-${d.attempt}`} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className={`is-${d.tone}`}>
          <code>{d.type}</code><span className="gpd-meta"><em>signed</em><em>attempt {d.attempt}</em></span><span className={`gp-state is-${d.tone}`}>{d.status}</span>
        </motion.li>)}</AnimatePresence>
        {!deliveries.length && <li className="gpd-history-empty">Waiting for the first event…</li>}
      </ul></LayoutGroup>
      <button type="button" className="gp-link gpd-replay" onClick={() => { setN(0); setRun(r => r + 1); }}><RotateCcw size={15} aria-hidden="true" />Replay sequence</button>
    </div>
  </div>;
}

/* ── 6.5 System rail ───────────────────────────────────────────────────────────────────────────────────────────────────── */
const SYSTEM: [string, string][] = [
  ["Scoped API keys", "Keys carry only the scopes you grant (for example events:read) and act with the permissions of the person who created them."],
  ["Idempotency", "Send an Idempotency-Key with tool calls; a replay within 24 hours returns the stored result instead of acting twice."],
  ["Versioned API", "Responses carry Gala-Api-Version (currently 2026-10-29); pin a version with the same header."],
  ["HMAC-signed webhooks", "Gala-Signature is an HMAC-SHA256 over the timestamp and raw body; both secrets sign during a rotation."],
  ["Retries & replay", "Failed deliveries retry with backoff from 1 minute to 24 hours, and any delivery can be replayed from Settings → Developers."],
  ["Audit logs", "Every REST and MCP call is logged with a request ID, the key, the tool and the response status."],
  ["Rate limits", "Each key has a per-minute limit (120 by default); a 429 response includes Retry-After."],
  ["OpenAPI", "Every operation is described in /api/v1/openapi.json, generated from the same tool definitions the API runs."],
];
export function SystemRail() {
  const [open, setOpen] = useState(0);
  return <div className="gpd-rail">
    <LayoutGroup id="gpd-rail">
      <ul className="gpd-rail-items">
        {SYSTEM.map(([t, d], i) => <li key={t}>
          <button type="button" aria-expanded={open === i} aria-controls={`gpd-rail-${i}`} id={`gpd-rail-b-${i}`} onClick={() => setOpen(i)} onFocus={() => setOpen(i)} className={cx("gpd-rail-btn", open === i && "is-on")}>
            {open === i && <motion.span layoutId="gpd-rail-line" className="gpd-rail-line" aria-hidden="true" />}
            <span>{t}</span><span className="gp-chip is-ok">Available</span>
          </button>
          <div id={`gpd-rail-${i}`} role="region" aria-labelledby={`gpd-rail-b-${i}`} className="gpd-rail-acc" hidden={open !== i}><p>{d}</p></div>
        </li>)}
      </ul>
    </LayoutGroup>
    <AnimatePresence mode="wait"><motion.p key={open} className="gpd-rail-tray" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
      <b>{SYSTEM[open]![0]}.</b> {SYSTEM[open]![1]}
    </motion.p></AnimatePresence>
  </div>;
}
