"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
      const sb = createClient(); const { data: { user } } = await sb.auth.getUser();
      if (!user) { toast("Your session expired. Sign in again.", "error"); return; }
      const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${user.id}/events/${eventId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await sb.storage.from("workspace-files").upload(path, f, { contentType: f.type, upsert: false });
      if (error) { toast("Upload failed. Please try again.", "error"); return; }
      await run(() => registerEventFile(eventId, path, f.name, kind));
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <><input ref={input} type="file" hidden accept={ALLOWED.join(",")} onChange={e => void onPick(e.target.files?.[0])} /><button className="k-btn primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={15} />{busy ? "Uploading…" : label}</button></>;
}
