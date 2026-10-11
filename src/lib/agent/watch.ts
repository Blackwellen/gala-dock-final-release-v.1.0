/** Watch condition evaluation (release spec §12 E). Pure, so it is shared by the runtime and tests. */
export type WatchCondition = { path: string; op: string; value?: unknown };
export const WATCH_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "changed", "exists"] as const;

export function watchHolds(c: WatchCondition, value: unknown, previous: unknown) {
  const n = (x: unknown) => Number(x);
  switch (c.op) {
    case "eq": return JSON.stringify(value) === JSON.stringify(c.value);
    case "neq": return JSON.stringify(value) !== JSON.stringify(c.value);
    case "gt": return n(value) > n(c.value);
    case "gte": return n(value) >= n(c.value);
    case "lt": return n(value) < n(c.value);
    case "lte": return n(value) <= n(c.value);
    case "contains": return Array.isArray(value) ? value.some(v => JSON.stringify(v).includes(String(c.value))) : String(value ?? "").includes(String(c.value));
    case "exists": return value !== undefined && value !== null && !(Array.isArray(value) && !value.length);
    case "changed": return previous !== undefined && previous !== null && JSON.stringify(value) !== JSON.stringify(previous);
    default: return false;
  }
}
