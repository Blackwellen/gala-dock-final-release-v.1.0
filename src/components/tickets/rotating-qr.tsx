"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Wallet QR that rotates every 30 seconds (§51: don't trust a static image indefinitely). A screenshot stops working within
 * a minute, and the code dies immediately on transfer/resale/refund. Offline, the last code is shown with an honest notice.
 */
export function RotatingQr({ ticketId, size = 240, logo = false, compact = false }: { ticketId: string; size?: number; logo?: boolean; compact?: boolean }) {
  const [svg, setSvg] = useState<string>("");
  const [state, setState] = useState<"loading" | "valid" | "offline" | "inactive">("loading");
  const [status, setStatus] = useState<string>("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, live = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/tickets/${ticketId}/credential`, { cache: "no-store" });
        const j = await r.json() as { status?: string; payload?: string; expiresInMs?: number };
        if (!live) return;
        if (j.status !== "valid" || !j.payload) { setState("inactive"); setStatus(j.status ?? "unavailable"); return; }
        setSvg(await QRCode.toString(j.payload, { type: "svg", errorCorrectionLevel: logo ? "H" : "M", margin: 1, width: size }));
        setState("valid");
        timer = setTimeout(load, Math.max(3000, (j.expiresInMs ?? 30000) - 1500));
      } catch { if (live) { setState(s => (s === "valid" ? "offline" : s === "loading" ? "offline" : s)); timer = setTimeout(load, 10000); } }
    };
    void load();
    return () => { live = false; clearTimeout(timer); };
  }, [ticketId, size, logo]);
  if (state === "inactive") return <div className="rq-void" role="status">This ticket is {status.replace("_", " ")} — it can’t be used for entry.</div>;
  return <figure className="rq" style={{ margin: 0, textAlign: "center" }}>
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <div aria-label="Entry QR code" role="img" style={{ width: size, height: size, opacity: state === "offline" ? 0.55 : 1 }} dangerouslySetInnerHTML={{ __html: svg }} />
      {/* Brand mark only with error-correction level H (30% recovery); the mark covers ~3% of the code, centred off the finder patterns. */}
      {logo && svg && <span className="rq-logo" aria-hidden="true">G</span>}
    </div>
    <figcaption className={compact ? "rq-cap compact" : "rq-cap"} style={compact ? undefined : { fontSize: 12, color: "#4a50a6", marginTop: 6 }}>{state === "loading" ? "Loading your entry code…" : state === "offline" ? "Offline — reconnect to refresh this code, or use your printed ticket." : "Live code · refreshes automatically"}</figcaption>
  </figure>;
}
