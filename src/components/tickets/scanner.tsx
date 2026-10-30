"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, WifiOff, Search, RefreshCw, Download } from "lucide-react";
import { scanCredential, scanManifest, scanLookup, syncOfflineScans, type ScanReply, type ManifestRow, type Snapshot } from "@/lib/tickets/scan";
import { scanZones, type ScanZone } from "@/lib/tickets/scan-zones";
import { CAMERA, cameraAvailable, createFrameDecoder, runScanLoop } from "@/lib/tickets/frame-decoder";
import "@/styles/scanner.css";

type Queued = { payload: string; at: string; device: string; local: string; zoneId?: string };
const LABEL: Record<string, [string, "ok" | "warn" | "bad"]> = {
  admitted: ["Valid — admit", "ok"], readmitted: ["Re-entry — admit", "ok"], duplicate: ["Already scanned", "warn"], invalid: ["Invalid ticket", "bad"],
  revoked: ["Revoked", "bad"], refunded: ["Refunded", "bad"], transferred: ["Transferred — old ticket", "bad"], resold: ["Resold — old ticket", "bad"],
  wrong_event: ["Wrong event", "bad"], wrong_session: ["Wrong date/session", "bad"], resale_locked: ["Listed for resale — not valid", "bad"],
  wrong_zone: ["Not valid for this zone", "bad"], outside_window: ["Zone not open now", "bad"], reentry_denied: ["Re-entry limit reached", "bad"],
  suspended: ["Pass suspended", "bad"], expired: ["Pass expired", "bad"], exited: ["Exit recorded", "ok"],
  pass_not_valid_here: ["Pass not valid for this event", "bad"], online_only_ticket: ["Online-only ticket — no in-person entry", "bad"],
  offline_ok: ["Provisionally admitted (offline)", "ok"], offline_dup: ["Already scanned on this device", "warn"], offline_unknown: ["Not on downloaded list", "bad"],
};
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } } };
const b64ToUuid = (s: string) => { try { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); const h = [...bin].map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join(""); return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : null; } catch { return null; } };

/** Gala Dock check-in scanner (§51): camera QR/barcode, manual code, attendee search, gates, offline-safe queue with reconciliation. */
export function TicketScanner({ eventId, eventName }: { eventId: string; eventName: string }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), busy = useRef(false);
  const K = (k: string) => `gd_scan_${eventId}_${k}`;
  const [online, setOnline] = useState(true), [cam, setCam] = useState(false), [supported, setSupported] = useState(true), [decoder, setDecoder] = useState<"" | "native" | "zxing">("");
  const [res, setRes] = useState<{ key: string; reply?: Extract<ScanReply, { ok: true }>; error?: string } | null>(null);
  const [code, setCode] = useState(""), [query, setQuery] = useState(""), [results, setResults] = useState<Awaited<ReturnType<typeof scanLookup>>>([]);
  const [gate, setGate] = useState(""), [log, setLog] = useState<{ at: string; label: string; tone: string; who: string }[]>([]);
  const [manifest, setManifest] = useState<{ rows: ManifestRow[]; at: string; snapshot?: Snapshot } | null>(null), [queue, setQueue] = useState<Queued[]>([]);
  const [report, setReport] = useState<string>("");
  // Q18 zone picker: only zones can_scan_event allows; "" = whole event (only when the scanner isn't zone-restricted).
  const [zones, setZones] = useState<{ general: boolean; zones: ScanZone[] } | null>(null), [zone, setZone] = useState("");
  const device = useRef("");

  useEffect(() => {
    device.current = store.get("gd_scan_device") ?? (() => { const d = `dev-${Math.random().toString(36).slice(2, 8)}`; store.set("gd_scan_device", d); return d; })();
    // Restore device state after mount (storage is browser-only), outside the effect body.
    queueMicrotask(() => {
      setOnline(navigator.onLine); setSupported(cameraAvailable()); setGate(store.get(K("gate")) ?? "");
      const m = store.get(K("manifest")); if (m) try { setManifest(JSON.parse(m)); } catch { /* corrupt cache */ }
      const q = store.get(K("queue")); if (q) try { setQueue(JSON.parse(q)); } catch { /* corrupt cache */ }
    });
    void scanZones(eventId).then(z => {
      setZones(z);
      const saved = store.get(K("zone")) ?? "";
      const pick = z.zones.some(x => x.id === saved) ? saved : z.general ? "" : z.zones[0]?.id ?? "";
      setZone(pick); store.set(K("zone"), pick);
    }).catch(() => setZones(null));
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); stream.current?.getTracks().forEach(t => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Q37 background sync: ask the browser to wake the worker when connectivity returns; it posts SYNC_SCANS back to this page.
  const persistQueue = (q: Queued[]) => {
    setQueue(q); store.set(K("queue"), JSON.stringify(q));
    if (q.length) void navigator.serviceWorker?.ready.then(r => (r as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("gd-scan-sync")).catch(() => {});
  };
  const push = (key: string, who: string) => { const [label, tone] = LABEL[key] ?? [key, "bad"]; setLog(l => [{ at: new Date().toLocaleTimeString(), label, tone, who }, ...l].slice(0, 12)); navigator.vibrate?.(tone === "ok" ? 60 : [70, 50, 70]); };

  const offlineScan = useCallback((payload: string) => {
    if (!manifest) { setRes({ key: "offline_unknown", error: "Offline and no guest list downloaded — download it while online." }); return; }
    const v = payload.trim();
    const m = /^GD2P?\.([A-Za-z0-9_-]{22})\./.exec(v), legacy = /^GD1:([A-Z0-9-]{6,40}):/i.exec(v);
    const id = m ? b64ToUuid(m[1]!) : null, codeV = legacy ? legacy[1]!.toUpperCase() : /^[A-Z0-9-]{6,40}$/i.test(v) ? v.toUpperCase() : null;
    const row = manifest.rows.find(r => (id && r.ticket_id === id) || (codeV && r.code === codeV));
    const seen = queue.some(q => q.payload === v && q.local === "offline_ok") || row?.status === "used";
    const key = !row ? "offline_unknown" : row.status !== "valid" && row.status !== "used" ? (row.status === "resale_listed" ? "resale_locked" : row.status) : seen ? "offline_dup" : "offline_ok";
    persistQueue([...queue, { payload: v, at: new Date().toISOString(), device: device.current, local: key, ...(zone ? { zoneId: zone } : {}) }]);
    setRes({ key, reply: row ? { ok: true, result: "admitted", attendee: row.attendee, tier: row.tier, seat: row.seat, code: row.code } : undefined });
    push(key, row?.attendee ?? v.slice(0, 18));
  }, [manifest, queue, zone]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(async (payload: string) => {
    if (!payload.trim() || busy.current) return;
    if (!navigator.onLine) { offlineScan(payload); setCode(""); return; }
    busy.current = true;
    const r = await scanCredential(eventId, payload, { device: device.current, gate, ...(zone ? { zoneId: zone } : {}) }).catch(() => ({ ok: false, error: "Network error — try again." }) as ScanReply);
    busy.current = false;
    if (r.ok) { setRes({ key: r.result, reply: r }); push(r.result, r.attendee ?? r.code ?? ""); } else setRes({ key: "error", error: r.error });
    setCode("");
  }, [eventId, gate, zone, offlineScan]);

  // The camera loop calls the latest submit (gate/zone changed while scanning apply to the next scan, not the one at start).
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; }, [submit]);
  // Attach the stream once the <video> exists (it mounts on the render after setCam(true)).
  useEffect(() => { const v = video.current; if (cam && v && stream.current && v.srcObject !== stream.current) { v.srcObject = stream.current; void v.play().catch(() => {}); } }, [cam]);
  async function start() {
    try {
      const pending = createFrameDecoder(["qr_code", "code_128"]).catch(() => null);   // loads while the permission prompt is open
      const s = await navigator.mediaDevices.getUserMedia(CAMERA); stream.current = s;
      const det = await pending; if (!det) throw new Error("decoder_unavailable");
      setCam(true); setDecoder(det.kind);
      runScanLoop({ decoder: det, video: () => video.current, active: () => !!stream.current, onCode: v => submitRef.current(v) });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setRes({ key: "error", error: denied ? "Camera access was blocked — allow the camera in your browser settings, or use manual entry." : "Camera unavailable — allow camera access or use manual entry." }); stop();
    }
  }
  function stop() { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCam(false); }

  /** `quiet`: refresh after a sync — keep the sync report (conflicts needing attention) on screen instead of replacing it. */
  async function download(quiet = false) {
    const r = await scanManifest(eventId, device.current);
    if (!r.ok) { if (!quiet) setReport(r.error); return; }
    const m = { rows: r.rows, at: r.at, snapshot: r.snapshot }; setManifest(m); store.set(K("manifest"), JSON.stringify(m)); if (!quiet) setReport(`Downloaded ${r.rows.length} tickets for offline use.`);
  }
  async function sync() {
    if (!queue.length) return;
    const out = await syncOfflineScans(eventId, queue, manifest?.snapshot);
    const mismatches = out.filter(o => o.server.ok && ((o.local === "offline_ok") !== ["admitted", "readmitted"].includes(o.server.result)));
    persistQueue([]);
    setReport(`Synced ${out.length} offline scans. ${mismatches.length ? `${mismatches.length} need attention: ${mismatches.map(m => `${m.server.ok ? (m.server.attendee ?? m.server.code) : ""} → ${m.server.ok ? LABEL[m.server.result]?.[0] : ""}`).join("; ")}` : "No conflicts."}`);
    void download(true);
  }
  useEffect(() => { if (online && queue.length) queueMicrotask(() => void sync()); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "SYNC_SCANS" && navigator.onLine && queue.length) void sync(); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [queue]); // eslint-disable-line react-hooks/exhaustive-deps

  const [label, tone] = res ? LABEL[res.key] ?? ["Error", "bad"] : ["", ""];
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : XCircle;
  return <div className="sc">
    <div className="sc-bar"><b>{eventName}</b>
      <span className={`sc-net ${online ? "on" : "off"}`}>{online ? "Online" : <><WifiOff size={13} aria-hidden="true" />Offline — scans queued</>}</span>
      {zones && (zones.zones.length > 0 || !zones.general) && <label className="sc-gate">Zone <select value={zone} aria-label="Zone you are scanning for" onChange={e => { setZone(e.target.value); store.set(K("zone"), e.target.value); }}>
        {zones.general && <option value="">Whole event</option>}{zones.zones.map(z => <option key={z.id} value={z.id}>{z.name}{z.status === "closed" ? " (closed)" : ""}</option>)}
        {!zones.general && !zones.zones.length && <option value="">No zones assigned to you</option>}</select></label>}
      <label className="sc-gate">Gate <input value={gate} maxLength={30} onChange={e => { setGate(e.target.value); store.set(K("gate"), e.target.value); }} placeholder="Main" /></label></div>
    <div className="sc-cam" data-decoder={decoder || undefined}>{cam ? <video ref={video} playsInline muted aria-label="Camera preview" /> : <div className="sc-ph"><Camera size={30} aria-hidden="true" /><span>{supported ? "Scan QR or barcode tickets with your camera" : "No camera is available in this browser — use manual entry"}</span></div>}</div>
    <div className="sc-row">{supported && (cam ? <button className="mk-btn ghost" onClick={stop}><CameraOff size={15} aria-hidden="true" />Stop camera</button> : <button className="mk-btn primary" onClick={() => void start()}><Camera size={15} aria-hidden="true" />Start scanning</button>)}
      <form className="sc-manual" onSubmit={e => { e.preventDefault(); void submit(code); }}><input value={code} onChange={e => setCode(e.target.value)} placeholder="Ticket code" aria-label="Ticket code" autoCapitalize="characters" /><button className="mk-btn ghost" disabled={!code.trim()}>Check</button></form></div>
    <div aria-live="assertive">{res && <div className={`sc-result ${tone}`}><Icon size={26} aria-hidden="true" /><div><b>{label}</b>
      {res.error ? <small>{res.error}</small> : res.reply && <small>{[res.reply.attendee, res.reply.tier, res.reply.seat, res.reply.zone, res.reply.code].filter(Boolean).join(" · ")}</small>}
      {tone !== "ok" && res.reply?.reason && <small>{res.reply.reason}</small>}
      {res.reply?.history && res.reply.history.length > 1 && <small>History: {res.reply.history.slice(1, 4).map(h => `${h.result} ${new Date(h.at).toLocaleTimeString()}${h.gate ? ` @${h.gate}` : ""}`).join(", ")}</small>}</div></div>}</div>
    <form className="sc-search" onSubmit={async e => { e.preventDefault(); setResults(online ? await scanLookup(eventId, query) : (manifest?.rows ?? []).filter(r => `${r.attendee} ${r.code} ${r.seat} ${r.tier}`.toLowerCase().includes(query.toLowerCase())).slice(0, 25).map(r => ({ ...r, attendee: r.attendee ?? "", email: "", tier: r.tier ?? "" }))); }}>
      <Search size={15} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, seat, table or tier" aria-label="Attendee search" /><button className="mk-btn ghost" disabled={query.trim().length < 2}>Search</button></form>
    {results.length > 0 && <ul className="sc-list">{results.map(r => <li key={r.ticket_id}><div><b>{r.attendee || "Guest"}</b><small>{[r.tier, r.seat, r.code, r.status === "used" ? `in ${r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString() : ""}` : r.status].filter(Boolean).join(" · ")}</small></div>
      <button className="mk-btn primary" disabled={r.status !== "valid"} onClick={() => void submit(r.code)}>Admit</button></li>)}</ul>}
    <div className="sc-row sc-offline">
      <button className="mk-btn ghost" onClick={() => void download()} disabled={!online}><Download size={14} aria-hidden="true" />{manifest ? `Refresh offline list (${manifest.rows.length})` : "Download for offline"}</button>
      {queue.length > 0 && <button className="mk-btn primary" onClick={() => void sync()} disabled={!online}><RefreshCw size={14} aria-hidden="true" />Sync {queue.length} offline scans</button>}
      {manifest && <small>List from {new Date(manifest.at).toLocaleTimeString()}. Offline admissions are provisional until synced.</small>}</div>
    {report && <p className="mk-note" role="status">{report}</p>}
    {log.length > 0 && <ul className="sc-log" aria-label="Recent scans">{log.map((l, i) => <li key={i}><span>{l.at}</span><span>{l.who}</span><b className={l.tone}>{l.label}</b></li>)}</ul>}
  </div>;
}
