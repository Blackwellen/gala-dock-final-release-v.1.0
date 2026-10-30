"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";

const CHANNELS: [string, string][] = [["link", "Plain link"], ["qr", "QR code / print"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["facebook", "Facebook"], ["x", "X"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["other", "Other"]];

/**
 * W07 · "Customise" for referral links (was a plain link to another tab). Promoter links: /r/<code>?c=<channel>&a=<asset> — the
 * route records the channel and asset on the click (Q27), so per-channel stats stop being all "link". Partner links: the landing
 * page is chosen (home, events, organisers). Pure URL building; nothing is saved.
 */
export function LinkBuilder({ base, kind, assets = [], pages = [] }: { base: string; kind: "promoter" | "partner"; assets?: { id: string; title: string }[]; pages?: [string, string][] }) {
  const id = useId();
  const [channel, setChannel] = useState("link");
  const [asset, setAsset] = useState("");
  const [page, setPage] = useState(pages[0]?.[0] ?? "/");
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = kind === "promoter"
    ? `${origin}${base}${channel !== "link" || asset ? `?c=${channel}${asset ? `&a=${asset}` : ""}` : ""}`
    : `${origin}${page}${page.includes("?") ? "&" : "?"}${base.replace(/^.*\?/, "")}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); } };
  return <div className="lb">
    {kind === "promoter" ? <>
      <label htmlFor={`${id}-ch`}>Where will you share it?</label>
      <select id={`${id}-ch`} value={channel} onChange={e => setChannel(e.target.value)}>{CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {assets.length > 0 && <><label htmlFor={`${id}-as`}>Campaign asset (optional)</label>
        <select id={`${id}-as`} value={asset} onChange={e => setAsset(e.target.value)}><option value="">No asset</option>{assets.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></>}
    </> : <><label htmlFor={`${id}-pg`}>Landing page</label>
      <select id={`${id}-pg`} value={page} onChange={e => setPage(e.target.value)}>{pages.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></>}
    <div className="lb-out"><code aria-live="polite">{url}</code><button type="button" onClick={copy} aria-label="Copy customised link">{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy"}</button></div>
    <small>{kind === "promoter" ? "Clicks and sales from this link are counted under the channel you pick." : "Your referral code stays on the link whichever page people land on."}</small>
    <style>{`.lb{display:grid;gap:6px;margin-top:8px;font-size:12px;color:#1d2068}.lb select{height:34px;border:1px solid #d9e2f1;border-radius:8px;padding:0 8px;font:inherit;background:#fff;min-width:0}
.lb-out{display:flex;gap:6px;align-items:center;border:1px solid #e3eaf6;border-radius:8px;padding:6px 6px 6px 10px;background:#f8faff;min-width:0}.lb-out code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px}
.lb-out button{display:inline-flex;gap:5px;align-items:center;border:0;border-radius:6px;background:#1a1af2;color:#fff;padding:5px 9px;font:inherit;font-size:11.5px;cursor:pointer}.lb-out svg{width:13px;height:13px}.lb small{color:#5d60a8}`}</style>
  </div>;
}
