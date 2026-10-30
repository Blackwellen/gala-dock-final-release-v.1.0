"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { useAction, useKitToast } from "@/components/kit/client";
import { registerEventFile } from "@/lib/actions/files";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export function FileUploader({ eventId, label = "Upload file", kind = "file" }: { eventId: string; label?: string; kind?: "file" | "poster" | "image" }) {
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const toast = useKitToast(); const { run } = useAction();
  async function onPick(f: File | undefined) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { toast("Upload a PDF, PNG, JPG or WebP file.", "error"); return; }
    if (f.size > 10 * 1024 * 1024) { toast("Files must be 10 MB or smaller.", "error"); return; }
    setBusy(true);
    try {
      const form = new FormData(); form.append("file", f); form.append("purpose", "document");
      const response = await fetch("/api/uploads", {method:"POST",body:form}); const uploaded = await response.json();
      if(!response.ok){toast(uploaded.error ?? "Upload failed.","error");return;}
      await run(() => registerEventFile(eventId, uploaded.path, uploaded.name, kind));
    } catch { toast("Upload failed. Check your connection and try again.","error"); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <><input ref={input} type="file" hidden accept={ALLOWED.join(",")} onChange={e => void onPick(e.target.files?.[0])} /><button className="k-btn primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={15} />{busy ? "Uploading…" : label}</button></>;
}
