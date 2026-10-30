/**
 * Versioned cache (Q06, cards 170/263). Pure: tests inject the version source and clock.
 * Every entry is stored under `${scope}@${version}:${key}`. The database bumps `cache_versions(scope)` whenever data behind the
 * scope changes (e.g. any public search document changes → 'search:public'), so a new version makes every older entry
 * unreachable at once — invalidation is driven by the data change itself, not by guessing TTLs. The version is re-read at most
 * every `versionTtlMs`, which bounds staleness (default 2 s); entries also expire after `ttlMs`.
 */
export type VersionSource = (scope: string) => Promise<number>;

export class VersionedCache {
  private entries = new Map<string, { at: number; value: unknown }>();
  private versions = new Map<string, { at: number; v: number }>();
  constructor(private source: VersionSource, private o: { ttlMs?: number; versionTtlMs?: number; max?: number; now?: () => number } = {}) {}
  private now() { return (this.o.now ?? Date.now)(); }

  async version(scope: string) {
    const cur = this.versions.get(scope), t = this.now();
    if (cur && t - cur.at < (this.o.versionTtlMs ?? 2000)) return cur.v;
    const v = await this.source(scope).catch(() => -1);   // version source down → bypass the cache (never serve possibly-stale data)
    this.versions.set(scope, { at: t, v });
    return v;
  }

  async get<T>(scope: string, key: string, load: () => Promise<T>): Promise<{ value: T; hit: boolean; version: number }> {
    const v = await this.version(scope);
    if (v < 0) return { value: await load(), hit: false, version: v };
    const k = `${scope}@${v}:${key}`, e = this.entries.get(k), t = this.now();
    if (e && t - e.at < (this.o.ttlMs ?? 60_000)) return { value: e.value as T, hit: true, version: v };
    const value = await load();
    this.entries.set(k, { at: t, value });
    if (this.entries.size > (this.o.max ?? 500)) for (const old of [...this.entries.keys()].slice(0, Math.ceil((this.o.max ?? 500) / 5))) this.entries.delete(old);
    return { value, hit: false, version: v };
  }

  /** Local invalidation (e.g. right after this instance wrote): forces a version re-read on the next get. */
  invalidate(scope: string) { this.versions.delete(scope); }
}
