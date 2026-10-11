/** Service coverage map: OpenStreetMap tiles centred on a base location with the service radius drawn on top. Pure SVG (server or client). */
export const UK_PLACES: Record<string, [number, number]> = {
  London: [51.5072, -0.1276], Manchester: [53.4808, -2.2426], Birmingham: [52.4862, -1.8904], Leeds: [53.8008, -1.5491], Bristol: [51.4545, -2.5879], Liverpool: [53.4084, -2.9916],
  Edinburgh: [55.9533, -3.1883], Glasgow: [55.8642, -4.2518], Brighton: [50.8225, -0.1372], Oxford: [51.752, -1.2577], Cambridge: [52.2053, 0.1218], Cardiff: [51.4816, -3.1791], Dublin: [53.3498, -6.2603],
};

export function CoverageMap({ base = "London", radiusMiles = 40, extendedMiles, width = 300, height = 180, className = "" }: { base?: string; radiusMiles?: number; extendedMiles?: number; width?: number; height?: number; className?: string }) {
  const [lat, lng] = UK_PLACES[base] ?? UK_PLACES.London;
  const outer = Math.max(radiusMiles, extendedMiles ?? 0) * 1609.34;
  // Pick a zoom where the outer radius spans ~40% of the height.
  const mppWanted = outer / (height * 0.42), z = Math.max(5, Math.min(13, Math.floor(Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mppWanted))));
  const n = 2 ** z, mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / n;
  const fx = ((lng + 180) / 360) * n, latR = (lat * Math.PI) / 180, fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const cx = width / 2, cy = height / 2, tiles: { k: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(fx - cx / 256) - 1; tx <= Math.floor(fx + cx / 256) + 1; tx++) for (let ty = Math.floor(fy - cy / 256) - 1; ty <= Math.floor(fy + cy / 256) + 1; ty++)
    tiles.push({ k: `${z}/${tx}/${ty}`, x: cx + (tx - fx) * 256, y: cy + (ty - fy) * 256 });
  const r = (radiusMiles * 1609.34) / mpp, re = extendedMiles ? (extendedMiles * 1609.34) / mpp : 0;
  return <svg className={`cov-map ${className}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Coverage: ${radiusMiles} miles from ${base}`}>
    {tiles.map(t => <image key={t.k} href={`https://tile.openstreetmap.org/${t.k}.png`} x={t.x} y={t.y} width={256.5} height={256.5} />)}
    <rect width={width} height={height} fill="#eef3ff" opacity=".18" />
    {re > r && <circle cx={cx} cy={cy} r={re} fill="#7c4dff14" stroke="#7c4dff66" strokeDasharray="5 4" />}
    <circle cx={cx} cy={cy} r={r} fill="#2f6bff26" stroke="#2f6bff" strokeWidth="1.5" />
    <g transform={`translate(${cx} ${cy - 14})`}><path d="M0 14C-6 6-8 2-8-2a8 8 0 1 1 16 0c0 4-2 8-8 16z" fill="#1a1af2" stroke="#fff" strokeWidth="1.5" /><circle cy="-2" r="3" fill="#fff" /></g>
    <text x={cx} y={cy + 16} textAnchor="middle" className="cov-label">{base}</text>
    <text x={width - 4} y={height - 4} textAnchor="end" className="cov-attr">© OpenStreetMap contributors</text>
  </svg>;
}
