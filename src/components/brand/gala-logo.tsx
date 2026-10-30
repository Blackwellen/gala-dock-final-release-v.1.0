/* eslint-disable @next/next/no-img-element */
/**
 * Gala·Dock lockup as drawn in the workspace designs: the circular "G" mark followed by the purple wordmark
 * (Account Dashboard reference at 1536: mark 44px at x=34, wordmark 91→210). The wordmark is the official
 * letterforms (public/brand/gala-dock-wordmark.png, cut from gala-dock-logo-trim.png) recoloured #6906EB, sampled from the design.
 *
 * Size it with `size` (mark height in px) or the `--gd-h` custom property from CSS (any length, e.g. `1.69em`).
 * `markOnly` renders the symbol alone; `light` renders both parts white for dark backgrounds.
 * Wrap it in the shell's own <Link>; the lockup itself is decorative when the link carries the label.
 */
import type { CSSProperties } from "react";

export const BRAND_PURPLE = "#6906EB";

export function GalaLogo({ size, markOnly = false, light = false, className = "", label = "Gala·Dock" }: { size?: number; markOnly?: boolean; light?: boolean; className?: string; label?: string }) {
  const style = size ? ({ "--gd-h": `${size}px` } as CSSProperties) : undefined;
  return <span className={`gd-lockup${markOnly ? " gd-mark-only" : ""}${light ? " gd-light" : ""}${className ? ` ${className}` : ""}`} style={style} role="img" aria-label={label}>
    <img className="gd-lockup-mark" src="/brand/gala-dock-mark-trim.png" alt="" width={116} height={115} />
    {!markOnly && <img className="gd-lockup-word" src="/brand/gala-dock-wordmark.png" alt="" width={301} height={46} />}
  </span>;
}
