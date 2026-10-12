"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Copy, Check, Search, Menu, X, Share2 } from "lucide-react";
import { copyText } from "@/lib/ui/dialogs";

/** In-page search: filters rows marked with data-q (case-insensitive) and hides panels left with no matches. */
export function PortalSearch({ placeholder }: { placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const term = q.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>("[data-q]").forEach(el => { el.hidden = !!term && !(el.dataset.q ?? "").toLowerCase().includes(term); });
    document.querySelectorAll<HTMLElement>("[data-q-group]").forEach(g => {
      const rows = g.querySelectorAll<HTMLElement>("[data-q]");
      g.classList.toggle("pt-no-match", !!term && rows.length > 0 && [...rows].every(r => r.hidden));
    });
  }, [q]);
  return <form className="pt-search" role="search" onSubmit={e => e.preventDefault()}>
    <Search aria-hidden="true" /><label className="pt-sr" htmlFor="pt-search">Search this portal</label>
    <input id="pt-search" ref={ref} type="search" placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
    <kbd>⌘ K</kbd>
  </form>;
}

export function NavToggle() {
  const [open, setOpen] = useState(false);
  useEffect(() => { document.querySelector(".pt-app")?.classList.toggle("nav-open", open); }, [open]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if ((e.target as HTMLElement).closest(".pt-side a")) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return <button type="button" className="pt-nav-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? <X /> : <Menu />}</button>;
}

/** Copies an absolute URL (relative paths are resolved against the current origin). */
export function CopyButton({ value, label = "Copy", className = "pt-copy", children }: { value: string; label?: string; className?: string; children?: ReactNode }) {
  const [done, setDone] = useState(false);
  return <button type="button" className={className} aria-label={label} title={done ? "Copied" : label} onClick={async () => {
    const text = value.startsWith("/") ? `${location.origin}${value}` : value;
    if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1600); }
  }}>{done ? <Check aria-hidden="true" /> : children ?? <Copy aria-hidden="true" />}</button>;
}

/** Shows a path as an absolute URL once mounted (server render shows the path). */
export function AbsoluteUrl({ path }: { path: string }) {
  const origin = useSyncExternalStore(() => () => {}, () => location.origin, () => "");
  return <span>{origin}{path}</span>;
}

export function ShareButton({ path, title, text, label = "Share", primary = false }: { path: string; title: string; text: string; label?: string; primary?: boolean }) {
  const [msg, setMsg] = useState("");
  return <button type="button" className={`pt-btn ${primary ? "primary" : "outline"} pt-share`} onClick={async () => {
    const url = `${location.origin}${path}`;
    if (navigator.share) { try { await navigator.share({ title, text, url }); } catch { /* dismissed */ } return; }
    if (await copyText(url)) { setMsg("Link copied"); setTimeout(() => setMsg(""), 1600); }
  }}><Share2 aria-hidden="true" />{msg || label}</button>;
}

/** Share target opening a network's composer with the referral URL. Networks without a web composer copy the link instead. */
export function SocialLink({ network, path, text, label, children }: { network: "whatsapp" | "facebook" | "x" | "linkedin" | "email" | "copy"; path: string; text: string; label: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={`pt-soc ${network}`} aria-label={label} title={copied ? "Link copied" : label} onClick={async () => {
    const url = `${location.origin}${path}`, u = encodeURIComponent(url), t = encodeURIComponent(text);
    const target = { whatsapp: `https://wa.me/?text=${t}%20${u}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`, x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, email: `mailto:?subject=${t}&body=${u}`, copy: "" }[network];
    if (target) { window.open(target, "_blank", "noopener,noreferrer"); return; }
    if (await copyText(`${text} ${url}`)) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
  }}>{children}</button>;
}
