/**
 * Q19 · Stale-version reload-merge for the venue structure and event map editors. Pure (no I/O) so it is unit-tested.
 *
 * When a save is refused with `stale_version:N` (someone else saved version N after this session opened version `base`), the
 * editor loads version N ("theirs") and three-way merges by element id:
 *   - elements only one side changed take that side; elements both changed identically are kept once;
 *   - an element both sides changed differently is a conflict — "mine" wins by default and the id is reported for review;
 *   - additions from both sides are kept; a deletion wins unless the other side edited that element (then it is kept + reported).
 * Elements without an id (legacy plans) are matched by type + label.
 */
export type MergeEl = { id?: string; type?: string; label?: string } & Record<string, unknown>;
export type MergeResult<T extends MergeEl> = { elements: T[]; conflicts: string[]; added: { mine: number; theirs: number }; removed: { mine: number; theirs: number } };

const keyOf = (e: MergeEl, i: number) => (typeof e.id === "string" && e.id ? `id:${e.id}` : `tl:${e.type ?? ""}:${e.label ?? ""}:${i}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const index = <T extends MergeEl>(l: T[]) => { const m = new Map<string, T>(); l.forEach((e, i) => m.set(keyOf(e, i), e)); return m; };

export function mergeElements<T extends MergeEl>(base: T[], mine: T[], theirs: T[]): MergeResult<T> {
  const B = index(base), M = index(mine), Th = index(theirs);
  const out: T[] = [], conflicts: string[] = [];
  const added = { mine: 0, theirs: 0 }, removed = { mine: 0, theirs: 0 };
  // Order: theirs first (their saved layout), then my additions — z-order of the saved version is preserved.
  const keys = [...Th.keys(), ...[...M.keys()].filter(k => !Th.has(k))];
  for (const k of keys) {
    const b = B.get(k), m = M.get(k), t = Th.get(k);
    const label = String((m ?? t ?? b)?.label || (m ?? t ?? b)?.id || k);
    if (!b) {                                          // added on at least one side
      if (m && t) { out.push(m); if (!same(m, t)) conflicts.push(label); }
      else if (m) { out.push(m); added.mine++; }
      else if (t) { out.push(t); added.theirs++; }
      continue;
    }
    if (!m && !t) continue;                            // both deleted
    if (!m) { if (same(t, b)) { removed.mine++; continue; } out.push(t!); conflicts.push(label); continue; }   // I deleted, they edited → keep theirs
    if (!t) { if (same(m, b)) { removed.theirs++; continue; } out.push(m); conflicts.push(label); continue; }   // they deleted, I edited → keep mine
    const mChanged = !same(m, b), tChanged = !same(t, b);
    if (mChanged && tChanged && !same(m, t)) { out.push(m); conflicts.push(label); }
    else out.push(mChanged ? m : t);
  }
  return { elements: out, conflicts, added, removed };
}

/** `stale_version:7` → 7 (the version that is now current), or null. */
export function staleVersion(message: string | undefined | null) {
  const m = /stale_version:(\d+)/.exec(message ?? "");
  return m ? Number(m[1]) : null;
}
