"use client";

import { useEffect, useState } from "react";
import { BarcodeSheet } from "./barcode-sheet";
import QRCode from "qrcode";
import { code128Svg } from "@/lib/tickets/code128";
import "@/styles/ticket-credential.css";

type Mode = "qr" | "visual" | "barcode";
export type TicketView = { id: string; code: string; status: string; event: string; date: string; time: string; venue: string; holder: string; tier: string;
  section?: string | null; row?: string | null; seat?: string | null; orderRef: string; artwork?: string | null; rules?: string; transfer?: string };
const LABEL: Record<Mode, string> = { qr: "QR", visual: "Ticket", barcode: "Barcode" };

/**
 * One entitlement, three presentations (media spec §69–76): QR, visual admission ticket and Code 128 barcode. Switching changes the
 * view only — every mode encodes the same rotating, signed credential, so screenshots expire and old tickets die on transfer/resale.
 */
export function TicketCredential({ ticket, defaultMode = "qr", allowSwitch = true, modes = ["qr", "visual", "barcode"], compact = false }: { ticket: TicketView; defaultMode?: Mode; allowSwitch?: boolean; modes?: Mode[]; /** QR/barcode only — the host page already shows the code, status and facts. */ compact?: boolean }) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [payload, setPayload] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "valid" | "offline" | "inactive">("loading");
  const [qr, setQr] = useState("");
  const [big, setBig] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, live = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/tickets/${ticket.id}/credential`, { cache: "no-store" });
        const j = await r.json() as { status?: string; payload?: string; expiresInMs?: number };
        if (!live) return;
        if (j.status !== "valid" || !j.payload) { setState("inactive"); return; }
        setPayload(j.payload); setState("valid");
        setQr(await QRCode.toString(j.payload, { type: "svg", errorCorrectionLevel: "M", margin: 1 }));
        timer = setTimeout(load, Math.max(3000, (j.expiresInMs ?? 30000) - 1500));
      } catch { if (live) { setState(s => (s === "inactive" ? s : "offline")); timer = setTimeout(load, 10000); } }
    };
    void load();
    return () => { live = false; clearTimeout(timer); };
  }, [ticket.id]);

  const dim = state === "offline" ? " dim" : "";
  const seat = [ticket.section && `Section ${ticket.section}`, ticket.row && `Row ${ticket.row}`, ticket.seat && `Seat ${ticket.seat}`].filter(Boolean).join(" · ");
  const credential = state === "inactive" ? <div className="tc-void">Not valid for entry — {ticket.status.replace("_", " ")}</div>
    : !payload ? <div className="tc-loading">Loading your entry code…</div>
    : mode === "barcode" ? <><div className={`tc-barcode${dim}`} dangerouslySetInnerHTML={{ __html: code128Svg(payload, { height: 90, module: 1 }) }} />
      {/* The inline barcode is capped to its card (<1 CSS px per module on phones — too fine to scan): enlarge fills the screen. */}
      <button type="button" className="tc-enlarge" onClick={() => setBig(true)}>Enlarge barcode for scanning</button>
      {big && <BarcodeSheet payload={payload} onClose={() => setBig(false)} />}</>
    : <div className={`tc-qr${dim}`} role="img" aria-label="Entry QR code" dangerouslySetInnerHTML={{ __html: qr }} />;

  return <div className="tc">
    {allowSwitch && modes.length > 1 && <div className="tc-switch" role="tablist" aria-label="Display as">{modes.map(m => <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}>{LABEL[m]}</button>)}</div>}
    {mode === "visual" ? <article className="tc-visual" aria-label={`Ticket for ${ticket.event}`}>
      <div className="tc-main" style={ticket.artwork ? { backgroundImage: `linear-gradient(180deg,rgba(9,10,82,.35),rgba(9,10,82,.92)),url(${ticket.artwork})` } : undefined}>
        <small>GALA DOCK · ADMISSION</small><h2>{ticket.event}</h2><p>{ticket.date} · {ticket.time}</p><p>{ticket.venue}</p></div>
      <div className="tc-stub"><dl><div><dt>Holder</dt><dd>{ticket.holder}</dd></div><div><dt>Ticket</dt><dd>{ticket.tier}</dd></div>{seat && <div><dt>Seat</dt><dd>{seat}</dd></div>}<div><dt>No.</dt><dd>{ticket.code}</dd></div></dl>
        <div className="tc-mini">{credential}</div></div>
    </article> : compact ? <section className="tc-card tc-compact">{credential}</section> : <section className="tc-card">
      {credential}
      <p className="tc-ref">{ticket.code}</p>
      <dl className="tc-facts"><div><dt>Event</dt><dd>{ticket.event}</dd></div><div><dt>When</dt><dd>{ticket.date} · {ticket.time}</dd></div><div><dt>Venue</dt><dd>{ticket.venue}</dd></div>
        <div><dt>Holder</dt><dd>{ticket.holder}</dd></div><div><dt>Ticket</dt><dd>{ticket.tier}</dd></div>{seat && <div><dt>Seat</dt><dd>{seat}</dd></div>}<div><dt>Order</dt><dd>{ticket.orderRef}</dd></div>
        {ticket.transfer && <div><dt>Transfer / resale</dt><dd>{ticket.transfer}</dd></div>}</dl>
      {ticket.rules && <p className="tc-rules">{ticket.rules}</p>}
    </section>}
    <p className="tc-note">{state === "offline" ? "Offline — reconnect to refresh this code, or use your printed ticket." : "Live code · refreshes every 30 seconds. Screenshots stop working."}</p>
  </div>;
}
