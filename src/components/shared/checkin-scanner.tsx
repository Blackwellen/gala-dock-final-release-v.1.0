"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, Keyboard, CheckCircle2, XCircle, AlertTriangle, WifiOff } from "lucide-react";
import { scanCredential, type ScanReply } from "@/lib/tickets/scan";
import { CAMERA, cameraAvailable, createFrameDecoder, runScanLoop } from "@/lib/tickets/frame-decoder";

// Every outcome comes from scan_admission (the Q18/Q21 engine: signed rotating credentials, session window, resale lock,
// online-only tiers, zones) — the same path as the full-screen scanner, so manual check-in can't admit what the door refuses.
const MSG: Record<string, string> = {
  admitted: "Admitted", readmitted: "Re-entry — admitted", duplicate: "Already checked in", invalid: "Ticket not valid for this event", wrong_event: "Ticket is for another event",
  revoked: "Ticket cancelled", refunded: "Ticket refunded", transferred: "Ticket transferred — old ticket", resold: "Ticket resold — old ticket", resale_locked: "Listed for resale — not valid",
  wrong_session: "Wrong date or session", online_only_ticket: "Online-only ticket — no in-person entry", pass_not_valid_here: "Pass not valid for this event",
  wrong_zone: "Not valid for this zone", outside_window: "Zone not open now", reentry_denied: "Re-entry limit reached",
};
/** Ticket scanner: camera (BarcodeDetector, or the on-device zxing fallback) and manual code lookup. Online-only by design. */
export function CheckInScanner({ eventId, compact }: { eventId: string; compact?: boolean }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const busy = useRef(false);
  const [cam, setCam] = useState(false); const [supported, setSupported] = useState(true); const [code, setCode] = useState(""); const [pending, setPending] = useState(false);
  const [decoder, setDecoder] = useState<"" | "native" | "zxing">("");
  const [res, setRes] = useState<ScanReply | null>(null); const [online, setOnline] = useState(true); const [log, setLog] = useState<{ code: string; result: string; at: string }[]>([]);
  useEffect(() => { queueMicrotask(() => { setOnline(navigator.onLine); setSupported(cameraAvailable()); }); const on = () => setOnline(true), off = () => setOnline(false); addEventListener("online", on); addEventListener("offline", off); return () => { removeEventListener("online", on); removeEventListener("offline", off); stop(); }; }, []);
  function stop() { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCam(false); }
  const submit = useCallback(async (v: string) => {
    if (!v.trim() || busy.current) return; if (!navigator.onLine) { setRes({ ok: false, error: "Offline — secure check-in requires a connection." }); return; }
    busy.current = true; setPending(true);
    const r = await scanCredential(eventId, v).catch(() => ({ ok: false, error: "Network error." }) as ScanReply);
    busy.current = false; setPending(false); setRes(r);
    if (r.ok) { setLog(l => [{ code: r.code ?? v.slice(0, 18), result: r.result, at: new Date().toLocaleTimeString() }, ...l].slice(0, 8)); navigator.vibrate?.(r.result === "admitted" || r.result === "readmitted" ? 60 : [60, 60, 60]); if (r.result === "admitted" || r.result === "readmitted") router.refresh(); }
    setCode("");
  }, [eventId, router]);
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; }, [submit]);
  useEffect(() => { const v = video.current; if (cam && v && stream.current && v.srcObject !== stream.current) { v.srcObject = stream.current; void v.play().catch(() => {}); } }, [cam]);
  async function start() {
    try {
      const det = createFrameDecoder(["qr_code", "code_128"]).catch(() => null);
      const s = await navigator.mediaDevices.getUserMedia(CAMERA); stream.current = s;
      const d = await det; if (!d) throw new Error("decoder_unavailable");
      setCam(true); setDecoder(d.kind);
      runScanLoop({ decoder: d, video: () => video.current, active: () => !!stream.current, onCode: v => submitRef.current(v) });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setRes({ ok: false, error: denied ? "Camera access was blocked — allow the camera in your browser settings, or use manual lookup." : "Camera unavailable — allow camera access or use manual lookup." }); stop();
    }
  }
  const ok = res?.ok ? res : null;
  const tone = ok ? (ok.result === "admitted" || ok.result === "readmitted" ? "green" : ok.result === "duplicate" ? "amber" : "red") : res ? "red" : null;
  const Icon = tone === "green" ? CheckCircle2 : tone === "amber" ? AlertTriangle : XCircle;
  const msg = ok ? MSG[ok.result] ?? ok.reason ?? ok.result : res && !res.ok ? res.error : "";
  return <div className="ck">
    {!online && <div className="k-notice red"><WifiOff size={16} />You&apos;re offline. Secure check-in needs a connection; scans are not queued.</div>}
    {/* Compact (dialog) mode is manual lookup only: no preview → no camera, so it is never left open unseen. */}
    {!compact && <div className="ck-cam" data-decoder={decoder || undefined}>{cam ? <video ref={video} playsInline muted aria-label="Camera preview" /> : <div className="ck-cam-ph"><Camera size={30} /><span>{supported ? "Scan ticket QR codes or barcodes with your camera" : "No camera is available in this browser — use manual lookup"}</span></div>}</div>}
    <div className="k-row k-wrap" style={{ gap: 8 }}>
      {!compact && supported && (cam ? <button className="k-btn ghost" onClick={stop}><CameraOff size={15} />Stop camera</button> : <button className="k-btn primary" onClick={() => void start()}><Camera size={15} />Open QR scanner</button>)}
      <form className="k-row k-grow" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); void submit(code); }}><div className="k-input-icon k-grow"><Keyboard size={15} /><input className="k-input" value={code} onChange={e => setCode(e.target.value)} placeholder="Ticket code e.g. GLD-NEON-6F3K-9P2M" aria-label="Ticket code" autoCapitalize="characters" /></div><button className="k-btn outline" disabled={pending || !code.trim()}>Manual check-in</button></form>
    </div>
    <div aria-live="assertive">{res && <div className={`ck-result ${tone}`}><Icon size={22} /><div><b>{msg}</b>{ok && ok.attendee && <div className="k-small">{ok.attendee}{ok.code ? ` · ${ok.code}` : ""}</div>}{ok && tone === "red" && ok.reason && <div className="k-small">{ok.reason}</div>}</div></div>}</div>
    {log.length > 0 && <ul className="ck-log">{log.map((l, i) => <li key={i}><span className="k-tnum">{l.at}</span><span>{l.code}</span><b className={l.result === "admitted" || l.result === "readmitted" ? "k-green" : l.result === "duplicate" ? "k-amber" : "k-red"}>{l.result}</b></li>)}</ul>}
  </div>;
}
