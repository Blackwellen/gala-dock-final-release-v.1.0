// Shared by Media Studio (path layers) and the map studio (curves). Pure — safe on the server.
/** Smooth (Catmull-Rom → cubic Bézier) or straight path through points. */
export function pathD(pts: { x: number; y: number }[], smooth: boolean, closed: boolean) {
  if (pts.length < 2) return pts.length ? `M${pts[0]!.x} ${pts[0]!.y}` : "";
  if (!smooth) return `M${pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")}${closed ? " Z" : ""}`;
  const P = closed ? [pts[pts.length - 1]!, ...pts, pts[0]!, pts[1]!] : [pts[0]!, ...pts, pts[pts.length - 1]!];
  let d = `M${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1]!, P[i]!, P[i + 1]!, P[i + 2]!];
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
}
