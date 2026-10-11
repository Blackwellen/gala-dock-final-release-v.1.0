"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, CheckCircle2, XCircle, AlertTriangle, WifiOff } from "lucide-react";
import { scanTicket, type ScanResult } from "@/lib/actions/checkin";

type BarcodeDetectorT = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
/** Ticket scanner: camera (BarcodeDetector) where available, manual code lookup everywhere. Online-only by design. */
export function CheckInScanner({ eventId, compact }: { eventId: string; compact?: boolean }) {
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const last = useRef<{ v: string; t: number }>({ v: "", t: 0 });
  const [cam, setCam] = useState(false); const [supported, setSupported] = useState(true); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ScanResult | null>(null); const [online, setOnline] = useState(true); const [log, setLog] = useState<{ code: string; result: string; at: string }[]>([]);
  useEffect(() => { setOnline(navigator.onLine); const on = () => setOnline(true), off = () => setOnline(false); addEventListener("online", on); addEventListener("offline", off); setSupported("BarcodeDetector" in window); return () => { removeEventListener("online", on); removeEventListener("offline", off); stop(); }; }, []);
  function stop() { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCam(false); }
  async function submit(v: string) {
    if (!v.trim() || busy) return; if (!navigator.onLine) { setRes({ ok: false, error: "Offline — secure check-in requires a connection." }); return; }
    setBusy(true); const r = await scanTicket(eventId, v).catch(() => ({ ok: false, error: "Network error." }) as ScanResult); setBusy(false); setRes(r);
    if (r.ok) { setLog(l => [{ code: r.code ?? v, result: r.result!, at: new Date().toLocaleTimeString() }, ...l].slice(0, 8)); navigator.vibrate?.(r.result === "admitted" ? 60 : [60, 60, 60]); }
    setCode("");
  }
  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); stream.current = s; setCam(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play(); } });
      const det = new (window as unknown as { BarcodeDetector: new (o: object) => BarcodeDetectorT }).BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => { if (!stream.current || !video.current) return; try { const found = await det.detect(video.current); const v = found[0]?.rawValue; if (v && (v !== last.current.v || Date.now() - last.current.t > 3000)) { last.current = { v, t: Date.now() }; await submit(v); } } catch { /* frame not ready */ } setTimeout(() => void tick(), 350); };
      void tick();
    } catch { setRes({ ok: false, error: "Camera unavailable — allow camera access or use manual lookup." }); stop(); }
  }
  const tone = res?.ok ? (res.result === "admitted" ? "green" : res.result === "duplicate" ? "amber" : "red") : res ? "red" : null;
  const Icon = tone === "green" ? CheckCircle2 : tone === "amber" ? AlertTriangle : XCircle;
  const msg = res?.ok ? { admitted: "Admitted", duplicate: "Already checked in", invalid: "Ticket not valid for this event", revoked: "Ticket transferred, resold or refunded" }[res.result!] : res?.error;
  return <div className="ck">
    {!online && <div className="k-notice red"><WifiOff size={16} />You&apos;re offline. Secure check-in needs a connection; scans are not queued.</div>}
    {!compact && <div className="ck-cam">{cam ? <video ref={video} playsInline muted aria-label="Camera preview" /> : <div className="ck-cam-ph"><Camera size={30} /><span>{supported ? "Scan ticket QR codes with your camera" : "Camera scanning isn't supported in this browser — use manual lookup"}</span></div>}</div>}
    <div className="k-row k-wrap" style={{ gap: 8 }}>
      {supported && (cam ? <button className="k-btn ghost" onClick={stop}><CameraOff size={15} />Stop camera</button> : <button className="k-btn primary" onClick={() => void start()}><Camera size={15} />Open QR scanner</button>)}
      <form className="k-row k-grow" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); void submit(code); }}><div className="k-input-icon k-grow"><Keyboard size={15} /><input className="k-input" value={code} onChange={e => setCode(e.target.value)} placeholder="Ticket code e.g. GLD-NEON-6F3K-9P2M" aria-label="Ticket code" autoCapitalize="characters" /></div><button className="k-btn outline" disabled={busy || !code.trim()}>Manual check-in</button></form>
    </div>
    <div aria-live="assertive">{res && <div className={`ck-result ${tone}`}><Icon size={22} /><div><b>{msg}</b>{res.ok && res.attendee && <div className="k-small">{res.attendee} · {res.code}</div>}</div></div>}</div>
    {log.length > 0 && <ul className="ck-log">{log.map((l, i) => <li key={i}><span className="k-tnum">{l.at}</span><span>{l.code}</span><b className={l.result === "admitted" ? "k-green" : l.result === "duplicate" ? "k-amber" : "k-red"}>{l.result}</b></li>)}</ul>}
  </div>;
}
