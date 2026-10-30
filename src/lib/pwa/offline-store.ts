"use client";

/**
 * Q37 offline store (domains 232.1–232.4): an explicit, user-scoped IndexedDB cache for the few things that must work without a
 * connection — ticket passes (static print credential + display fields), event summaries, organiser run sheets and provider job
 * sheets. Rules:
 *  - derived, repeatable reads only; never the source of truth for payments, capacity, inventory or permissions;
 *  - every entry has a TTL (default: until the event ends + 12 h) and the owning user id; reads of expired or other-user entries miss;
 *  - cleared on sign-out (PwaLifecycle) and when the server says access is revoked (callers drop the key on a 401/403/404);
 *  - writes from offline are not stored here: offline actions (scans) use their own queue and are re-authorised on sync.
 */
export type OfflineKind = "ticket_pass" | "event" | "run_sheet" | "job_sheet";
export type OfflineEntry<T = unknown> = { key: string; kind: OfflineKind; userId: string; savedAt: number; expiresAt: number; data: T };

const DB = "gd-offline", STORE = "entries", VERSION = 1;
const MAX_ENTRIES = 200;

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" }).createIndex("kind", "kind"); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { resolve(req ? (req.result as T) : null); db.close(); };
    t.onerror = t.onabort = () => { resolve(null); db.close(); };
  });
}

export async function saveOffline<T>(kind: OfflineKind, id: string, userId: string, data: T, expiresAt: number) {
  if (!userId || !id || expiresAt <= Date.now()) return false;
  const entry: OfflineEntry<T> = { key: `${kind}:${userId}:${id}`, kind, userId, savedAt: Date.now(), expiresAt, data };
  const all = (await tx<OfflineEntry[]>("readonly", s => s.getAll())) ?? [];
  if (all.length >= MAX_ENTRIES) await pruneOffline(true);
  return (await tx("readwrite", s => s.put(entry))) !== null;
}

export async function readOffline<T>(kind: OfflineKind, id: string, userId: string): Promise<T | null> {
  const e = await tx<OfflineEntry<T> | undefined>("readonly", s => s.get(`${kind}:${userId}:${id}`));
  if (!e || e.userId !== userId || e.expiresAt <= Date.now()) return null;
  return e.data;
}

export async function listOffline<T>(kind: OfflineKind, userId: string): Promise<OfflineEntry<T>[]> {
  const all = (await tx<OfflineEntry<T>[]>("readonly", s => s.index("kind").getAll(kind))) ?? [];
  return all.filter(e => e.userId === userId && e.expiresAt > Date.now()).sort((a, b) => a.expiresAt - b.expiresAt);
}

export const dropOffline = (kind: OfflineKind, id: string, userId: string) => tx("readwrite", s => s.delete(`${kind}:${userId}:${id}`));

/** Removes expired entries (and, when full, the oldest quarter). */
export async function pruneOffline(full = false) {
  const all = (await tx<OfflineEntry[]>("readonly", s => s.getAll())) ?? [];
  const now = Date.now();
  const drop = all.filter(e => e.expiresAt <= now).map(e => e.key);
  if (full) drop.push(...all.filter(e => e.expiresAt > now).sort((a, b) => a.savedAt - b.savedAt).slice(0, Math.ceil(all.length / 4)).map(e => e.key));
  for (const k of drop) await tx("readwrite", s => s.delete(k));
  return drop.length;
}

/** Sign-out / account switch: nothing private survives on the device. */
export async function clearOffline() {
  try { indexedDB.deleteDatabase(DB); } catch { /* storage unavailable */ }
}
