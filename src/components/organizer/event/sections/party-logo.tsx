"use client";
import "@/styles/party-logo.css";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useAction, useKitToast } from "@/components/kit/client";
import { uploadPublicMedia } from "@/lib/files/upload-public";
import { setPartyLogo } from "@/lib/actions/party-logo";

/** Sponsor / exhibitor logo: uploaded through the Q04 public-media route (PNG/JPG/WebP, checked and scanned server-side), then saved on the party. */
export function PartyLogo({ partyId, workspaceId, name, logo, disabledReason }: { partyId: string; workspaceId: string; name: string; logo: string | null; disabledReason?: string | null }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) { toast("Upload a PNG, JPG or WebP image.", "error"); return; }
    if (f.size > 10 * 1024 * 1024) { toast("Images must be smaller than 10MB.", "error"); return; }
    setBusy(true);
    try { const url = await uploadPublicMedia(workspaceId, f, `${name} logo`); await run(() => setPartyLogo(partyId, url)); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed", "error"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const off = !!disabledReason || pending || busy;
  return <div className="eo-kv eo-logo"><span>Logo</span><span className="eo-acts">
    <span className="eo-logo-box" aria-hidden={!logo}>{logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt={`${name} logo`} /> : <small>{name.slice(0, 1)}</small>}</span>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void pick(e.target.files?.[0])} />
    <button type="button" className="k-btn outline sm" disabled={off} title={disabledReason ?? undefined} onClick={() => input.current?.click()}>{busy ? <Loader2 size={13} className="k-spin" /> : <ImagePlus size={13} />}{logo ? "Replace" : "Upload logo"}</button>
    {logo && <button type="button" className="k-btn ghost sm" disabled={off} onClick={() => void run(() => setPartyLogo(partyId, null))}><Trash2 size={13} />Remove</button>}
  </span></div>;
}
