"use client";

import { Link2 } from "lucide-react";
import { useToast } from "@/components/ui";

export function CopyLink() {
  const toast = useToast();
  return <button type="button" className="ws-btn outline" onClick={async () => {
    try { await navigator.clipboard.writeText(window.location.href.split("?")[0]); toast("Link copied — only your team can open it"); } catch { toast("Couldn’t copy the link"); }
  }}><Link2 aria-hidden="true" />Copy link</button>;
}
