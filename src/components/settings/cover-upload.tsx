"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { uploadPublicMedia } from "@/lib/files/upload-public";

type Result = { ok: boolean; message?: string; error?: string };

/**
 * Q62: workspace cover image upload shared by provider and organiser Settings. The image goes through the files pipeline
 * (/api/files/public-media: membership check, magic-byte type sniff, polyglot check, metadata strip, scan) and only then is saved
 * as the workspace cover by the server action, which accepts nothing but this workspace's pipeline URLs. Status is announced inline
 * (the two shells use different toast systems).
 */
export function CoverUpload({ workspaceId, save, label = "Change photo", className = "", buttonClass = "" }: { workspaceId: string; save: (url: string) => Promise<Result>; label?: string; className?: string; buttonClass?: string }) {
  const input = useRef<HTMLInputElement>(null); const router = useRouter();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f || busy) return;
    if (f.size > 10 * 1024 * 1024) { setMsg({ text: "Images must be smaller than 10MB.", error: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const url = await uploadPublicMedia(workspaceId, f, f.name);
      const r = await save(url);
      if (!r.ok) setMsg({ text: r.error ?? "Couldn't save the cover image.", error: true });
      else { setMsg({ text: r.message ?? "Cover image updated.", error: false }); router.refresh(); }
    } catch (e) { setMsg({ text: (e as Error).message || "Upload failed.", error: true }); }
    finally { setBusy(false); }
  };
  return <span className={`cover-upload ${className}`}>
    <button type="button" className={`cover-upload-btn ${buttonClass}`} onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
      {busy ? <Loader2 size={14} className="k-spin" aria-hidden="true" /> : <Camera size={14} aria-hidden="true" />}{busy ? "Uploading…" : label}</button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={label} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
    <span className="cover-upload-msg" role={msg?.error ? "alert" : "status"} style={msg ? { color: msg.error ? "#b42318" : "#067647", fontSize: 12 } : undefined}>{msg?.text ?? ""}</span>
  </span>;
}
