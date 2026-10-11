import "server-only";
/** Next document number "<PREFIX>-<YEAR>-<NNN>" after the highest existing one (counts collide after deletes). */
export function nextNumber(prefix: string, existing: (string | null)[], year = new Date().getFullYear()) {
  const re = new RegExp(`^${prefix}-${year}-(\d+)$`);
  const max = existing.reduce((m, n) => { const x = n ? re.exec(n) : null; return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}
