import type { ReactElement } from "react";

/** Seating-pattern illustration for a layout type (decorative; capacity always comes from data). */
export const LAYOUT_LABEL: Record<string, string> = { theatre: "Theatre", banquet: "Banquet", cabaret: "Cabaret", standing: "Standing", classroom: "Classroom", u_shape: "U-Shape", boardroom: "Boardroom", custom: "Custom" };
export const SEATED = ["theatre", "banquet", "cabaret", "classroom", "u_shape", "boardroom"];

export function LayoutGlyph({ type, size = 96, color = "#5b6cf0" }: { type: string; size?: number; color?: string }) {
  const h = Math.round(size * 0.62), s = { fill: "none", stroke: color, strokeWidth: 1.4 } as const;
  const dots: ReactElement[] = [];
  if (type === "theatre") { for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) if (c !== 4 && c !== 5) dots.push(<rect key={`${r}-${c}`} x={6 + c * 9} y={14 + r * 10} width={6} height={6} rx={1} {...s} />);
    dots.push(<rect key="stage" x={30} y={3} width={36} height={5} rx={1} fill={color} opacity={0.35} />); }
  else if (type === "banquet") { for (const [cx, cy] of [[20, 18], [48, 14], [76, 18], [20, 44], [48, 40], [76, 44]]) { dots.push(<circle key={`${cx}${cy}`} cx={cx} cy={cy} r={6} {...s} />);
    for (let a = 0; a < 8; a++) dots.push(<circle key={`${cx}${cy}${a}`} cx={cx + Math.cos((a * Math.PI) / 4) * 10} cy={cy + Math.sin((a * Math.PI) / 4) * 10} r={1.6} fill={color} />); } }
  else if (type === "cabaret") { for (const [cx, cy] of [[22, 18], [54, 16], [80, 24], [26, 46], [58, 44]]) { dots.push(<circle key={`${cx}${cy}`} cx={cx} cy={cy} r={6} {...s} />);
    for (let a = 1; a < 6; a++) dots.push(<circle key={`${cx}${cy}${a}`} cx={cx + Math.cos((a * Math.PI) / 3.2 - 0.1) * 10} cy={cy + Math.sin((a * Math.PI) / 3.2 - 0.1) * 10} r={1.6} fill={color} />); } }
  else if (type === "standing") { for (let i = 0; i < 46; i++) { const x = 8 + ((i * 37) % 82), y = 6 + ((i * 23) % 48); dots.push(<circle key={i} cx={x} cy={y} r={2.6} {...s} />); } }
  else if (type === "classroom") { for (let r = 0; r < 4; r++) for (const c of [0, 1]) { dots.push(<rect key={`${r}${c}`} x={10 + c * 44} y={8 + r * 13} width={32} height={4} rx={1} {...s} />);
    for (let k = 0; k < 4; k++) dots.push(<circle key={`${r}${c}${k}`} cx={14 + c * 44 + k * 8} cy={16 + r * 13} r={1.6} fill={color} />); } }
  else if (type === "u_shape") { dots.push(<path key="u" d="M24 8v40h48V8" {...s} strokeWidth={5} opacity={0.35} />);
    for (let k = 0; k < 5; k++) { dots.push(<circle key={`l${k}`} cx={16} cy={12 + k * 8} r={2} fill={color} />, <circle key={`r${k}`} cx={80} cy={12 + k * 8} r={2} fill={color} />); }
    for (let k = 0; k < 5; k++) dots.push(<circle key={`b${k}`} cx={30 + k * 9} cy={56} r={2} fill={color} />); }
  else if (type === "boardroom") { dots.push(<rect key="t" x={22} y={20} width={52} height={20} rx={4} {...s} />);
    for (let k = 0; k < 6; k++) dots.push(<circle key={`t${k}`} cx={27 + k * 8.4} cy={14} r={2} fill={color} />, <circle key={`b${k}`} cx={27 + k * 8.4} cy={46} r={2} fill={color} />); }
  else dots.push(<path key="c" d="M48 18v24M36 30h24" {...s} strokeWidth={2} />);
  return <svg width={size} height={h} viewBox="0 0 96 60" aria-hidden="true" className="layout-glyph">{dots}</svg>;
}
