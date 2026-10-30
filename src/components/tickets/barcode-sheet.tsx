"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { barcodeSheetFit, code128Modules, code128Svg } from "@/lib/tickets/code128";

/**
 * Full-screen Code 128 for scanning. The signed credential is ~670 modules wide, so the inline card barcode is below 1 CSS px per
 * module on phones and can't be read. Here the bars use the screen's long side (rotated 90° in portrait) and every module is a
 * whole number of device pixels (≥2 where the screen allows), drawn crisp on white. Same rotating payload as the card.
 */
export function BarcodeSheet({ payload, onClose }: { payload: string; onClose: () => void }) {
  const [geo, setGeo] = useState<{ rotate: boolean; module: number; height: number; dpx: number } | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const modules = code128Modules(payload);
    const fit = () => setGeo(barcodeSheetFit(modules, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1));
    fit();
    addEventListener("resize", fit);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    close.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", esc);
    return () => { removeEventListener("resize", fit); removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [payload, onClose]);
  return createPortal(<div className={`tc-sheet${geo?.rotate ? " rot" : ""}`} role="dialog" aria-modal="true" aria-label="Barcode for scanning">
    <button ref={close} type="button" className="tc-sheet-close" onClick={onClose} aria-label="Close enlarged barcode"><X size={20} aria-hidden="true" /></button>
    {geo && <div className={`tc-sheet-code${geo.rotate ? " rot" : ""}`} data-device-px-per-module={geo.dpx}
      dangerouslySetInnerHTML={{ __html: code128Svg(payload, { height: geo.height, module: geo.module }) }} />}
    <p className="tc-sheet-note">Turn up screen brightness and hold steady · refreshes every 30 seconds</p>
  </div>, document.body);
}
