// Plan underlays (uploaded drawings / aerials). Pure, so tests/release can load it (venue-map.tsx imports CSS).

/** Drawings/aerials come from our own upload store (/api/listing-media → Supabase public bucket). Anything else in a saved or
 *  imported plan file (third-party hosts, data:/javascript: URLs) is not drawn, so a plan can't make public map viewers load
 *  arbitrary remote content.
 *  Q55: "/\host/x.png" (and tab/newline tricks) is protocol-relative once the browser normalises the backslash, so a same-site path
 *  must start with "/" followed by a plain path character, and nothing may climb out of the store prefix with "..". */
export function safeUnderlayUrlFor(store: string, u?: string) {
  if (!u || /[\\\s]/.test(u)) return undefined;
  if (store.length > 30 && u.startsWith(store) && !u.includes("..")) return u;
  return /^\/[\w\-.~%]/.test(u) ? u : undefined;
}
