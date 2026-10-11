"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CalendarDays, Clock, MapPin, Download, Save, Sparkles, Undo2, Redo2, Minus, Plus, Maximize, Type, Image as ImageIcon, Shapes, QrCode, Layers, Palette, Loader2, ExternalLink, Eye, Link2, ChevronDown, Upload, CircleCheck } from "lucide-react";
import { Toggle, useAction, useKitToast } from "@/components/kit/client";
import { createClient } from "@/lib/supabase/client";
import { saveMediaAsset } from "@/lib/actions/builders";
import { suggestPosterCopy } from "@/lib/actions/poster-copy";

type Ev = { id: string; name: string; slug: string | null; status: string; when: string; date: string; time: string; venue: string; cover: string; tags: string[]; performers: string[]; price: number | null; gallery: string[] };
type Asset = { id: string; url: string; title: string; format: string; version: number; at: string; event?: string };
type Fmt = { key: string; label: string; sub: string; w: number; h: number; banner?: string; qr?: boolean };
const FORMATS: Fmt[] = [
  { key: "a3", label: "A3 Poster", sub: "297 × 420 mm", w: 1240, h: 1754 }, { key: "a4", label: "A4 Poster", sub: "210 × 297 mm", w: 1240, h: 1754 },
  { key: "square", label: "Square", sub: "1080 × 1080 px", w: 1080, h: 1080 }, { key: "portrait", label: "Portrait", sub: "4:5 (1080 × 1350)", w: 1080, h: 1350 },
  { key: "story", label: "Story", sub: "9:16 (1080 × 1920)", w: 1080, h: 1920 }, { key: "landscape", label: "Landscape", sub: "16:9 (1920 × 1080)", w: 1920, h: 1080 },
  { key: "qr", label: "QR Poster", sub: "A3 with QR", w: 1240, h: 1754, qr: true }, { key: "launch", label: "Ticket Launch", sub: "Social + Web", w: 1080, h: 1350, banner: "ON SALE NOW" },
  { key: "final", label: "Final Tickets", sub: "Last chance", w: 1080, h: 1350, banner: "FINAL TICKETS" }, { key: "soldout", label: "Sold Out", sub: "Announcement", w: 1080, h: 1350, banner: "SOLD OUT" },
];
const VARIANTS: { key: string; label: string; sub: string }[] = [
  { key: "a3", label: "A3 Poster", sub: "Print ready" }, { key: "a4", label: "A4 Poster", sub: "Print ready" }, { key: "square", label: "Square", sub: "Social media" },
  { key: "story", label: "Story", sub: "Instagram / TikTok" }, { key: "landscape", label: "16:9 Banner", sub: "Website / Ads" }, { key: "qr", label: "QR Poster", sub: "With ticket link" }, { key: "soldout", label: "Sold Out", sub: "Announcement" },
];
type Content = { name: string; when: string; time: string; venue: string; tagline: string; strap: string; performers: string; tickets: string; url: string; showQr: boolean; presenter: string; accent: string; bg: string; font: "impact" | "black" | "sans"; shade: number; brandGd: boolean; brandWs: boolean; brandVenue: boolean };
const ACCENTS = ["#ff2bd6", "#a855f7", "#22d3ee", "#a3e635", "#f59e0b", "#ffffff"];
const FONTS = { impact: "Impact, 'Arial Narrow Bold', sans-serif", black: "'Arial Black', 'Helvetica Neue', sans-serif", sans: "Inter, 'Helvetica Neue', Arial, sans-serif" } as const;
// Print-quality stock backdrops, used when the event's own imagery is too small for a poster.
const STOCK = ["/assets/gd/builder/poster/bg-neon-portrait.webp", "/assets/gd/builder/poster/bg-event-hero.webp", "/assets/gd/builder/poster/bg-neon-stage.webp"];
const fmtOf = (k: string) => FORMATS.find(f => f.key === k) ?? FORMATS[0]!;

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; }));
  return imgCache.get(src)!;
}

/** Draws the poster for a format onto a canvas. Pure function of content + format (also used for thumbnails and batch variants). */
async function render(cv: HTMLCanvasElement, f: Fmt, c: Content, wsName: string) {
  cv.width = f.w; cv.height = f.h; const g = cv.getContext("2d")!; const W = f.w, H = f.h, land = W > H, sq = W === H, u = Math.min(W, H) / 100;
  const ls = (px: number) => { if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; };
  g.fillStyle = "#0b0620"; g.fillRect(0, 0, W, H);
  try { const im = await loadImg(c.bg); const r = Math.max(W / im.width, H / im.height); g.drawImage(im, (W - im.width * r) / 2, (H - im.height * r) / 2, im.width * r, im.height * r); } catch { /* keep base colour */ }
  const k = c.shade / 100; const grad = g.createLinearGradient(0, 0, land ? W : 0, land ? 0 : H);
  if (land) { grad.addColorStop(0, `rgba(11,6,32,${.9 * k + .1})`); grad.addColorStop(.55, `rgba(11,6,32,${.55 * k})`); grad.addColorStop(1, "rgba(11,6,32,.1)"); }
  else { grad.addColorStop(0, `rgba(11,6,32,${.5 * k})`); grad.addColorStop(.42, "rgba(11,6,32,.08)"); grad.addColorStop(.66, `rgba(11,6,32,${.62 * k})`); grad.addColorStop(1, "rgba(11,6,32,.97)"); }
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const cx = land ? W * 0.3 : W / 2, maxW = land ? W * 0.54 : W * 0.9; g.textAlign = "center"; g.textBaseline = "alphabetic";
  const text = (s: string, y: number, size: number, o: { color?: string; font?: string; weight?: string; glow?: string; sp?: number; stroke?: string } = {}) => {
    g.font = `${o.weight ?? "400"} ${size}px ${o.font ?? FONTS.impact}`; ls(o.sp ?? 0);
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = size * .45; g.fillStyle = o.glow; g.globalAlpha = .75; g.fillText(s, cx, y, maxW); g.globalAlpha = 1; g.shadowBlur = size * .12; }
    if (o.stroke) { g.lineWidth = size * .045; g.strokeStyle = o.stroke; g.strokeText(s, cx, y, maxW); }
    g.fillStyle = o.color ?? "#fff"; g.fillText(s, cx, y, maxW); g.shadowBlur = 0; ls(0);
  };
  const sans = FONTS.sans;
  // headline block
  let y = land ? H * 0.17 : H * (sq ? 0.09 : 0.055);
  if (c.presenter) text(c.presenter.toUpperCase(), y, (land ? 1.9 : 2.1) * u, { font: sans, weight: "700", sp: .55 * u });
  const words = c.name.toUpperCase().split(/\s+/).filter(Boolean); const sub = words.length > 2 ? words.pop()! : "";
  const lines = !land && !sq && words.length > 1 ? words : [words.join(" ")];
  const big = Math.min((land ? 10.5 : sq ? 12 : 17) * u, (maxW / Math.max(...lines.map(l => l.length))) * 1.75);
  y += big * 1.08;
  for (const l of lines) { text(l, y, big, { font: FONTS[c.font], weight: c.font === "sans" ? "900" : "400", glow: c.accent, stroke: c.accent, color: "#fff4fd" }); y += big * .92; }
  if (sub) { y += .6 * u - big * .92 + big * .1; text(sub.split("").join(" "), y + 3.6 * u, (land ? 2.8 : 3.4) * u, { font: sans, weight: "600", sp: .9 * u }); y += 4 * u; }
  if (c.tagline) text(c.tagline.toUpperCase().replace(/\s*[•·]\s*/g, "  ·  "), y + 4.6 * u, (land ? 1.7 : 1.95) * u, { font: sans, weight: "700", sp: .32 * u });
  // details block
  const barH = (land ? 17 : sq ? 15 : 13.5) * u + ((c.brandGd || c.brandWs || c.brandVenue) && !land ? 5.5 * u : 0);
  let by = H - barH - (land ? 26 : sq ? 24 : 20) * u;
  const dsz = (land ? 3 : sq ? 3.6 : 4.3) * u;
  const iconLine = (y0: number, size: number, parts: { icon: "cal" | "clock" | "pin"; t: string }[]) => {
    g.font = `400 ${size}px ${FONTS.impact}`; const gap = size * .45, isz = size * .82, sep = size * .9;
    const widths = parts.map(p => isz + gap + g.measureText(p.t).width); const total = widths.reduce((a, b) => a + b, 0) + sep * (parts.length - 1);
    let x = cx - total / 2; g.textAlign = "left"; g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = Math.max(1.5, size * .08);
    parts.forEach((p, i) => {
      const iy = y0 - size * .72;
      if (p.icon === "cal") { g.beginPath(); g.roundRect(x, iy + isz * .12, isz, isz * .82, isz * .12); g.stroke(); g.beginPath(); g.moveTo(x, iy + isz * .38); g.lineTo(x + isz, iy + isz * .38); g.stroke(); }
      if (p.icon === "clock") { g.beginPath(); g.arc(x + isz / 2, iy + isz / 2 + isz * .06, isz / 2, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(x + isz / 2, iy + isz * .22); g.lineTo(x + isz / 2, iy + isz * .56); g.lineTo(x + isz * .74, iy + isz * .7); g.stroke(); }
      if (p.icon === "pin") { g.beginPath(); g.arc(x + isz / 2, iy + isz * .38, isz * .34, Math.PI, 0); g.lineTo(x + isz / 2, iy + isz); g.closePath(); g.stroke(); }
      g.fillText(p.t, x + isz + gap, y0); x += widths[i]! + sep;
    }); g.textAlign = "center";
  };
  iconLine(by, dsz, [{ icon: "cal", t: c.when }, ...(c.time ? [{ icon: "clock" as const, t: c.time }] : [])]); by += dsz * 1.12;
  iconLine(by, dsz * .72, [{ icon: "pin", t: c.venue.toUpperCase() }]); by += dsz * 1.35;
  if (c.performers) { text(c.performers.split(",").map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 5).join("  |  "), by, dsz * .68); by += dsz * .9; }
  if (c.strap) text(c.strap.toUpperCase().replace(/\s*[•·]\s*/g, "  ·  "), by, dsz * .38, { font: sans, weight: "600", sp: .25 * u });
  // footer bar
  const top = H - barH; g.fillStyle = "rgba(6,3,18,.78)"; g.fillRect(0, top, W, barH);
  const pad = 5 * u, row = (land ? 13 : 12) * u; g.textAlign = "center";
  const c1 = land ? pad + 12 * u : W * .2;
  g.fillStyle = "#fff"; g.font = `700 ${1.9 * u}px ${sans}`; ls(.15 * u); g.fillText("TICKETS FROM", c1, top + 4.6 * u); ls(0);
  g.font = `400 ${7.2 * u}px ${FONTS.impact}`; g.fillText(c.tickets.replace(/^tickets from\s*/i, ""), c1, top + 11.6 * u);
  const showQr = c.showQr || f.qr;
  if (showQr && c.url) {
    const qs = Math.round(row * .86), q = document.createElement("canvas");
    await QRCode.toCanvas(q, c.url, { margin: 1, width: Math.max(qs, 60), color: { dark: "#0b0620", light: "#ffffff" } });
    if (q.width > 0) g.drawImage(q, (land ? W * .3 : W * .45) - qs / 2, top + (row - qs) / 2 + .6 * u, qs, qs);
  }
  const bw = (land ? 22 : 30) * u, bh = 6.4 * u, bxc = land ? W * .48 : W * .76, byy = top + 2.6 * u;
  g.fillStyle = c.accent; g.shadowColor = c.accent; g.shadowBlur = 2 * u; g.beginPath(); g.roundRect(bxc - bw / 2, byy, bw, bh, bh / 2); g.fill(); g.shadowBlur = 0;
  g.fillStyle = c.accent === "#ffffff" ? "#0b0620" : "#fff"; g.font = `400 ${3 * u}px ${FONTS.impact}`; ls(.1 * u); g.fillText("BUY TICKETS  →", bxc, byy + bh * .7); ls(0);
  g.fillStyle = "#fff"; g.font = `700 ${1.35 * u}px ${sans}`; ls(.1 * u); g.fillText(c.url.replace(/^https?:\/\//, "").replace(/\/$/, "").toUpperCase().slice(0, 42), bxc, byy + bh + 2.6 * u); ls(0);
  if (!land && (c.brandGd || c.brandWs || c.brandVenue)) {
    const ry = top + row + 3.6 * u, bsz = 2.6 * u; g.font = `700 ${1.8 * u}px ${sans}`; g.textAlign = "left";
    if (c.brandGd) { try { const m = await loadImg("/brand/favicon-48.png"); g.drawImage(m, pad, ry - bsz * .8, bsz, bsz); } catch { /* text only */ } g.fillStyle = "#fff"; g.fillText("Gala·Dock", pad + bsz * 1.25, ry); }
    if (c.brandWs) { g.textAlign = "center"; g.fillText(wsName, W / 2, ry); }
    if (c.brandVenue) { g.textAlign = "right"; g.font = `800 ${1.4 * u}px ${sans}`; ls(.1 * u); g.fillText(c.venue.split(",")[0]!.toUpperCase().slice(0, 26), W - pad, ry); ls(0); }
    g.textAlign = "center";
  }
  if (f.banner) {
    g.save(); g.translate(W * .78, H * .13); g.rotate(-Math.PI / 12); const red = f.banner === "SOLD OUT";
    g.fillStyle = red ? "#e11d48" : c.accent; g.shadowColor = "#0008"; g.shadowBlur = 2 * u; g.fillRect(-W * .32, -5.5 * u, W * .64, 11 * u); g.shadowBlur = 0;
    g.fillStyle = "#fff"; g.font = `400 ${6.4 * u}px ${FONTS.impact}`; ls(.3 * u); g.textAlign = "center"; g.fillText(f.banner, 0, 2.4 * u); g.restore();
  }
}

export function PosterBuilder({ site, tab, event: e, workspaceId, workspaceName, library, previous }: { site: string; tab: "create" | "library" | "previous"; event: Ev; workspaceId: string; workspaceName: string; library: Asset[]; previous: Asset[] }) {
  const toast = useKitToast(); const { run } = useAction(); const cv = useRef<HTMLCanvasElement>(null);
  const [fmt, setFmt] = useState<Fmt>(FORMATS[0]!); const [zoom, setZoom] = useState(100); const [pane, setPane] = useState<"details" | "style" | "media" | "branding">("details");
  const [c, setC] = useState<Content>({ name: e.name, when: e.when, time: e.time, venue: e.venue, tagline: e.tags.slice(0, 4).join(" • "), strap: "", performers: e.performers.join(", "), tickets: e.price ? `Tickets from £${e.price}` : "Free entry", url: e.slug ? `${site.replace(/\/$/, "")}/events/${e.slug}` : site, showQr: true, presenter: `${workspaceName} presents`, accent: ACCENTS[0]!, bg: e.cover, font: "impact", shade: 70, brandGd: true, brandWs: true, brandVenue: true });
  const [hist, setHist] = useState<Content[]>([]); const [fut, setFut] = useState<Content[]>([]);
  const [opts, setOpts] = useState({ gallery: true, promo: true, library: true }); const [busy, setBusy] = useState<string | null>(null); const [menu, setMenu] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({}); const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => { loadImg(e.cover).then(im => { if (im.naturalHeight < 600) setC(x => x.bg === e.cover ? { ...x, bg: STOCK[0]! } : x); }, () => setC(x => ({ ...x, bg: STOCK[0]! }))); }, [e.cover]);
  const set = (p: Partial<Content>) => { setHist(h => [...h.slice(-30), c]); setFut([]); setC(x => ({ ...x, ...p })); };
  // Render offscreen and copy only the latest result, so overlapping async renders never interleave on screen.
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current; const off = document.createElement("canvas");
    void render(off, fmt, c, workspaceName).then(() => { const v = cv.current; if (!v || n !== seq.current) return; v.width = off.width; v.height = off.height; v.getContext("2d")!.drawImage(off, 0, 0); });
  }, [fmt, c, workspaceName]);
  useEffect(() => {
    let dead = false; const t = setTimeout(async () => {
      const out: Record<string, string> = {};
      for (const f of FORMATS) {
        if (dead) return; const big = document.createElement("canvas"); await render(big, f, c, workspaceName);
        const s = 220 / Math.max(f.w, f.h), k = document.createElement("canvas"); k.width = Math.round(f.w * s); k.height = Math.round(f.h * s);
        k.getContext("2d")!.drawImage(big, 0, 0, k.width, k.height); out[f.key] = k.toDataURL("image/jpeg", .8); if (!dead) setThumbs(o => ({ ...o, [f.key]: out[f.key]! }));
      }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [c, workspaceName]);
  const blobOf = useCallback(async (f: Fmt, type = "image/png") => { const k = document.createElement("canvas"); await render(k, f, c, workspaceName); return new Promise<Blob>((res, rej) => k.toBlob(b => b ? res(b) : rej(new Error("render")), type, .92)); }, [c, workspaceName]);
  const fileBase = e.name.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const download = async (f: Fmt, type: "png" | "jpg" = "png") => { const b = await blobOf(f, type === "png" ? "image/png" : "image/jpeg"); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${fileBase}-${f.key}.${type}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const put = async (b: Blob, ext: string) => {
    const sb = createClient(); const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("event-media").upload(path, b, { contentType: b.type, upsert: false }); if (error) throw error;
    return sb.storage.from("event-media").getPublicUrl(path).data.publicUrl;
  };
  const upload = async (f: Fmt, primary: boolean) => {
    const url = await put(await blobOf(f), "png");
    return run(() => saveMediaAsset({ event_id: e.id, url, title: `${e.name} — ${f.label}`, format: f.key, data: { ...c, format: f.key, promo: opts.promo }, gallery: primary && opts.gallery, poster: primary && opts.promo && ["a3", "a4", "portrait"].includes(f.key) }), { refresh: false });
  };
  const save = async () => { setBusy("save"); try { await upload(fmt, true); } catch { toast("Upload failed — check your connection", "error"); } setBusy(null); };
  const all = async () => { setBusy("all"); let n = 0; try { for (const v of VARIANTS) { await upload(fmtOf(v.key), v.key === fmt.key); n++; } toast(`${n} variants saved to your media library`); } catch { toast(`Saved ${n} of ${VARIANTS.length} variants — try again for the rest`, "error"); } setBusy(null); };
  const regenerate = async () => { setBusy("ai"); const r = await suggestPosterCopy({ event_id: e.id }); setBusy(null); if (!r.ok) return toast(r.error, "error"); set({ tagline: r.copy.tagline, strap: r.copy.strap || c.strap }); toast("New copy from Gala Agent — review before exporting"); };
  const addBg = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 8_000_000) return toast("Use a PNG, JPG or WebP under 8 MB", "error");
    setBusy("bg"); try { const url = await put(file, file.type.split("/")[1]!.replace("jpeg", "jpg")); setExtra(x => [url, ...x]); set({ bg: url }); } catch { toast("Upload failed", "error"); } setBusy(null);
  };
  const base = `/organizer/events/${e.id}/media`;
  const bgs = [...extra, e.cover, ...e.gallery, ...STOCK].filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 11);
  const count = (s: string, n: number) => <small>{s.length}/{n}</small>;
  const tools: [typeof Type, string, () => void][] = [
    [Type, "Text", () => { setPane("details"); document.getElementById("pb-tagline")?.focus(); }], [ImageIcon, "Image", () => setPane("media")], [Shapes, "Shapes", () => setPane("style")],
    [Sparkles, "Elements", () => setPane("branding")], [QrCode, "QR Code", () => set({ showQr: !c.showQr })], [Palette, "Background", () => setPane("media")], [Layers, "Layers", () => setPane("style")],
  ];
  const assetGrid = (items: Asset[], empty: string) => <section className="k-card pb-lib"><div className="pb-libg">{items.map(m => <figure key={m.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.url} alt={m.title} loading="lazy" /><figcaption><b>{m.title}</b><small>{m.event ? `${m.event} · ` : ""}v{m.version} · {new Date(m.at).toLocaleDateString("en-GB")}</small><span className="k-row" style={{ gap: 12 }}><a className="k-link" href={m.url} download target="_blank" rel="noreferrer">Download</a></span></figcaption></figure>)}{!items.length && <p className="k-small">{empty}</p>}</div></section>;

  return <>
    <div className="pb-head"><div className="k-grow"><div className="k-row" style={{ gap: 10 }}><h1>{e.name}</h1><span className={`pb-st ${e.status === "on_sale" ? "green" : "gray"}`}>{e.status === "on_sale" ? "On Sale" : e.status.replace(/_/g, " ")}</span></div><p className="pb-meta"><span><CalendarDays size={13} />{e.date}</span>{e.time && <span>{e.time}</span>}<span><MapPin size={13} />{e.venue}</span></p></div>
      <div className="k-row pb-acts"><Link className="k-btn outline" href={`/organizer/events/${e.id}`}><CalendarDays size={15} />Event details</Link>{e.slug && <Link className="k-btn outline" href={`/events/${e.slug}`} target="_blank"><Eye size={15} />Preview event page</Link>}
        <span className="pb-split"><button className="k-btn primary" onClick={() => void download(fmt)}><Download size={15} />Export</button><button className="k-btn primary" aria-label="Export options" aria-expanded={menu} onClick={() => setMenu(m => !m)}><ChevronDown size={15} /></button>
          {menu && <span className="pb-menu" role="menu"><button role="menuitem" onClick={() => { setMenu(false); void download(fmt, "png"); }}>PNG — {fmt.label}</button><button role="menuitem" onClick={() => { setMenu(false); void download(fmt, "jpg"); }}>JPG — {fmt.label}</button><button role="menuitem" onClick={() => { setMenu(false); void (async () => { for (const v of VARIANTS) await download(fmtOf(v.key)); })(); }}>All variants (PNG)</button></span>}</span></div></div>
    <nav className="k-tabs pb-tabs" aria-label="Media sections"><Link className="k-tab" href={base} aria-current={tab === "create" ? "page" : undefined}>Create</Link><Link className="k-tab" href={`${base}?tab=library`} aria-current={tab === "library" ? "page" : undefined}>Library{library.length ? ` (${library.length})` : ""}</Link><Link className="k-tab" href={`${base}?tab=previous`} aria-current={tab === "previous" ? "page" : undefined}>Previous Events</Link></nav>
    {tab === "library" ? assetGrid(library, "Nothing saved yet — design a poster and save it to your library.")
    : tab === "previous" ? assetGrid(previous, "Assets from your other events will appear here.")
    : <div className="pb-grid">
      <section className="k-card pb-c pb-tplc"><h2>1. Choose a template</h2><p className="pb-sub">Create professional event assets for any channel.</p>
        <div className="pb-tpls">{FORMATS.map((f, i) => <button key={f.key} className={i >= 6 ? "sm" : undefined} aria-pressed={fmt.key === f.key} onClick={() => setFmt(f)}><span className="pb-th">{thumbs[f.key] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumbs[f.key]} alt="" /> : <Loader2 size={16} className="k-spin" />}</span><b>{f.label}</b><small>{f.sub}</small></button>)}</div></section>
      <section className="k-card pb-c pb-design"><div className="pb-dh"><div><h2>2. Design your poster</h2><p className="pb-sub">Customise content, style and branding. Fields are auto-filled from your event.</p></div>
        <span className="k-row" style={{ gap: 6 }}><span className="pb-ur"><button disabled={!hist.length} onClick={() => { setFut(f => [c, ...f]); setC(hist.at(-1)!); setHist(h => h.slice(0, -1)); }} aria-label="Undo"><Undo2 size={15} /></button><button disabled={!fut.length} onClick={() => { setHist(h => [...h, c]); setC(fut[0]!); setFut(f => f.slice(1)); }} aria-label="Redo"><Redo2 size={15} /></button></span>
          <span className="pb-zoom"><button onClick={() => setZoom(z => Math.max(40, z - 10))} aria-label="Zoom out"><Minus size={14} /></button><b>{zoom}%</b><button onClick={() => setZoom(z => Math.min(160, z + 10))} aria-label="Zoom in"><Plus size={14} /></button></span><button className="pb-fit" onClick={() => setZoom(100)}><Maximize size={13} />Fit</button></span></div>
        <div className="pb-stage"><div className="pb-tools">{tools.map(([I, l, fn]) => <button key={l} onClick={fn} aria-pressed={l === "QR Code" ? c.showQr : undefined}><I size={17} strokeWidth={1.6} /><span>{l}</span></button>)}</div>
          <div className="pb-canvas"><div className="pb-sel" style={{ height: `${(fmt.h >= fmt.w ? 520 : 300) * zoom / 100}px`, aspectRatio: `${fmt.w} / ${fmt.h}` }}><canvas ref={cv} aria-label={`${fmt.label} preview`} />{["tl", "tm", "tr", "ml", "mr", "bl", "bm", "br"].map(h => <i key={h} className={`h-${h}`} />)}</div></div></div></section>
      <section className="k-card pb-c pb-edit"><h2>3. Edit content</h2>
        <nav className="pb-etabs" role="tablist">{(["details", "style", "media", "branding"] as const).map(p => <button key={p} role="tab" aria-selected={pane === p} onClick={() => setPane(p)}>{{ details: "Event Details", style: "Style", media: "Media", branding: "Branding" }[p]}</button>)}</nav>
        {pane === "details" && <div className="pb-fields">
          <label className="pb-f"><span>Event name {count(c.name, 100)}</span><input className="pb-in" maxLength={100} value={c.name} onChange={x => set({ name: x.target.value })} /></label>
          <div className="pb-f"><span>Date &amp; time</span><div className="pb-g2"><label className="pb-ic"><CalendarDays size={14} /><input className="pb-in" aria-label="Date" maxLength={30} value={c.when} onChange={x => set({ when: x.target.value })} /></label><label className="pb-ic"><Clock size={14} /><input className="pb-in" aria-label="Time" maxLength={20} value={c.time} onChange={x => set({ time: x.target.value })} /></label></div></div>
          <label className="pb-f"><span>Venue</span><input className="pb-in" maxLength={80} value={c.venue} onChange={x => set({ venue: x.target.value })} /></label>
          <label className="pb-f"><span>Headline / Tagline {count(c.tagline, 100)}</span><input id="pb-tagline" className="pb-in" maxLength={100} value={c.tagline} onChange={x => set({ tagline: x.target.value })} /></label>
          <label className="pb-f"><span>Performers (comma separated) {count(c.performers, 100)}</span><input className="pb-in" maxLength={100} value={c.performers} onChange={x => set({ performers: x.target.value })} /></label>
          <label className="pb-f"><span>Ticket info {count(c.tickets, 100)}</span><input className="pb-in" maxLength={100} value={c.tickets} onChange={x => set({ tickets: x.target.value })} /></label>
          <label className="pb-f"><span>Ticket URL</span><span className="pb-ic r"><input className="pb-in" type="url" maxLength={200} value={c.url} onChange={x => set({ url: x.target.value })} /><Link2 size={14} /></span></label>
          <div className="pb-qr"><Toggle checked={c.showQr} onChange={v => set({ showQr: v })} label="Show QR code" /><span>Show QR code</span><button className="pb-ai" disabled={busy === "ai"} onClick={() => void regenerate()}>{busy === "ai" ? <Loader2 size={14} className="k-spin" /> : <Sparkles size={14} />}Regenerate with Gala Agent</button></div></div>}
        {pane === "style" && <div className="pb-fields">
          <div className="pb-f"><span>Accent colour</span><span className="pb-acc">{ACCENTS.map(a => <button key={a} aria-pressed={c.accent === a} style={{ background: a }} onClick={() => set({ accent: a })} aria-label={`Accent ${a}`} />)}<label className="pb-cpick" aria-label="Custom colour"><input type="color" value={c.accent} onChange={x => set({ accent: x.target.value })} /></label></span></div>
          <div className="pb-f"><span>Headline font</span><span className="pb-seg">{(["impact", "black", "sans"] as const).map(f => <button key={f} aria-pressed={c.font === f} style={{ fontFamily: FONTS[f], fontWeight: f === "sans" ? 900 : 400 }} onClick={() => set({ font: f })}>{{ impact: "Condensed", black: "Heavy", sans: "Modern" }[f]}</button>)}</span></div>
          <label className="pb-f"><span>Background darkness <small>{c.shade}%</small></span><input type="range" min={0} max={100} value={c.shade} onChange={x => set({ shade: Number(x.target.value) })} /></label>
          <label className="pb-f"><span>Area strapline {count(c.strap, 60)}</span><input className="pb-in" maxLength={60} placeholder="Main Stage • Warehouse • Food & Drink" value={c.strap} onChange={x => set({ strap: x.target.value })} /></label></div>}
        {pane === "media" && <div className="pb-fields"><div className="pb-f"><span>Background image</span><div className="pb-bgs">{bgs.map(b => <button key={b} aria-pressed={c.bg === b} onClick={() => set({ bg: b })} aria-label="Use background">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={b} alt="" />{c.bg === b && <CircleCheck size={16} />}</button>)}
          <label className="pb-up">{busy === "bg" ? <Loader2 size={16} className="k-spin" /> : <Upload size={16} />}<span>Upload</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={x => { const f = x.target.files?.[0]; if (f) void addBg(f); x.target.value = ""; }} /></label></div><small className="pb-hint">PNG, JPG or WebP up to 8 MB. Images are stored in your workspace media.</small></div></div>}
        {pane === "branding" && <div className="pb-fields">
          <label className="pb-f"><span>Presenter line {count(c.presenter, 40)}</span><input className="pb-in" maxLength={40} value={c.presenter} onChange={x => set({ presenter: x.target.value })} /></label>
          {([["brandGd", "Gala Dock logo"], ["brandWs", `${workspaceName} name`], ["brandVenue", "Venue badge"]] as const).map(([k, l]) => <div key={k} className="pb-qr"><Toggle checked={c[k]} onChange={v => set({ [k]: v })} label={l} /><span>{l}</span></div>)}</div>}
      </section>
      <section className="k-card pb-c pb-var"><h2>4. Variations</h2><p className="pb-sub">Generate multiple formats with consistent branding.</p>
        <div className="pb-vars">{VARIANTS.map(v => { const f = fmtOf(v.key); return <button key={v.key} className={f.w > f.h ? "wide" : undefined} aria-pressed={fmt.key === v.key} onClick={() => setFmt(f)}><span className="pb-th">{thumbs[v.key] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumbs[v.key]} alt="" /> : <Loader2 size={16} className="k-spin" />}</span><b>{v.label}</b><small>{v.sub}</small></button>; })}
          <button className="pb-genall" disabled={!!busy} onClick={() => void all()}>{busy === "all" ? <Loader2 size={18} className="k-spin" /> : <Plus size={20} />}<span>Generate all variants</span></button></div></section>
      <section className="k-card pb-c pb-pub"><h2>5. Attach and publish</h2><p className="pb-sub">Use this asset across your event and promotion.</p>
        <div className="pb-checks">{([["gallery", "Attach to event page gallery"], ["promo", "Use in promotion campaigns"], ["library", "Add to media library"]] as const).map(([k, l]) => <label key={k}><input type="checkbox" checked={opts[k]} disabled={k === "library"} onChange={x => setOpts(o => ({ ...o, [k]: x.target.checked }))} />{l}</label>)}</div>
        <div className="pb-pubb"><button className="k-btn outline" onClick={() => void download(fmt)}><Download size={15} />Export selected</button><button className="k-btn primary" disabled={!!busy} onClick={() => void save()}>{busy === "save" ? <Loader2 size={15} className="k-spin" /> : <Save size={15} />}Save to library</button></div></section>
    </div>}
    {tab !== "create" && <p className="k-small" style={{ marginTop: 8 }}><ExternalLink size={12} /> Saved assets are public files — don&apos;t include personal data.</p>}
  </>;
}
