import type { SVGProps } from "react";

// Custom glyphs drawn to match the Gala Dock designs where lucide has no equivalent.
// Same API shape as lucide icons (size, className, aria-hidden) so they drop into IconTile.
type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

/** Three-person group (design's "Built for every role" / team glyph). */
export function PeopleGroup({ size = 24, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="7.2" r="2.6" />
    <path d="M7.3 19.5v-1.2a4.7 4.7 0 0 1 9.4 0v1.2" />
    <circle cx="5.2" cy="9.4" r="2" />
    <path d="M2 18.2v-.8a3.4 3.4 0 0 1 4-3.3" />
    <circle cx="18.8" cy="9.4" r="2" />
    <path d="M22 18.2v-.8a3.4 3.4 0 0 0-4-3.3" />
  </svg>;
}

/** Solid four-point sparkle with a small companion star (design's AI / Gala Agent glyph). */
export function SparkleSolid({ size = 24, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
    <path d="M9.2 6.2c.65 4.9 2.45 6.75 7.3 7.4-4.85.65-6.65 2.5-7.3 7.4-.65-4.9-2.45-6.75-7.3-7.4 4.85-.65 6.65-2.5 7.3-7.4Z" />
    <path d="M18.6 1.8c.3 2.2 1.1 3.05 3.3 3.35-2.2.3-3 1.15-3.3 3.35-.3-2.2-1.1-3.05-3.3-3.35 2.2-.3 3-1.15 3.3-3.35Z" />
  </svg>;
}
