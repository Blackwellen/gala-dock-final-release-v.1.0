"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";
import { trackPublic } from "./track";
import "@/styles/site-intro-video.css";

/** Brand intro films, served from the R2 `marketing-videos` bucket via its Cloudflare custom domain. */
export const INTRO_HOST = "https://media.blackwellen-operations.cloud";
/** Set to true once galadock-intro-{vertical,landscape}-share.mp4 are uploaded; until then the hero keeps its Explore button. */
export const GALA_DOCK_INTRO_READY = false;

const src = (o: "vertical" | "landscape") => `${INTRO_HOST}/gala-dock/intro/galadock-intro-${o}-share.mp4`;

/**
 * Hero "Watch the intro" button. Nothing is fetched until it is pressed; then the film opens over the page on a blacked-out
 * backdrop: X button, Esc or a click on the backdrop closes it, focus stays inside while open and returns to the button after.
 * Phones in portrait get the 9:16 cut, everything else the 16:9 cut.
 */
export function IntroVideoButton({ surface, label = "Watch the intro", length = "2 min" }: { surface: string; label?: string; length?: string }) {
  const [open, setOpen] = useState<null | "vertical" | "landscape">(null);
  const btn = useRef<HTMLButtonElement>(null);
  const start = () => {
    const portrait = window.matchMedia("(orientation: portrait) and (max-width: 820px)").matches;
    setOpen(portrait ? "vertical" : "landscape");
    trackPublic("hero_secondary_cta", surface, "watch_intro");
  };
  const close = useCallback(() => { setOpen(null); requestAnimationFrame(() => btn.current?.focus()); }, []);
  return <>
    <button ref={btn} type="button" className="gp-btn gp-btn--ghost" onClick={start} aria-haspopup="dialog">
      <Play size={18} className="gp-play" fill="currentColor" aria-hidden="true" />{label}<span className="gp-iv-len">{length}</span>
    </button>
    {open && createPortal(<IntroDialog orientation={open} onClose={close} />, document.body)}
  </>;
}

function IntroDialog({ orientation, onClose }: { orientation: "vertical" | "landscape"; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = Array.from(box.current.querySelectorAll<HTMLElement>("button, video[controls]"));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = prev; };
  }, [onClose]);
  return <div className="gp-iv" role="dialog" aria-modal="true" aria-label="Gala Dock intro video" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={box} className={`gp-iv-box gp-iv-box--${orientation}`}>
      <button ref={closeBtn} type="button" className="gp-iv-x" onClick={onClose} aria-label="Close video"><X size={24} aria-hidden="true" /></button>
      <video className="gp-iv-video" src={src(orientation)} controls autoPlay playsInline preload="auto" controlsList="nodownload" />
    </div>
  </div>;
}
