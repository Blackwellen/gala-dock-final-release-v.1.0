"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "We're confirming your order" used to promise the page would update but never re-checked, so a buyer who landed before the
 * payment webhook saw that message until they reloaded (Q47). Re-reads the order every few seconds for about a minute.
 */
export function ConfirmAutoRefresh({ everyMs = 4000, tries = 15 }: { everyMs?: number; tries?: number }) {
  const router = useRouter(); const [left, setLeft] = useState(tries);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => { setLeft(n => n - 1); router.refresh(); }, everyMs);
    return () => clearTimeout(t);
  }, [left, everyMs, router]);
  return left > 0 ? <p className="co-terms" role="status" aria-live="polite">Checking for your tickets…</p>
    : <p className="co-terms" role="status">Still processing. <button type="button" className="co-link" onClick={() => setLeft(tries)}>Check again</button></p>;
}
