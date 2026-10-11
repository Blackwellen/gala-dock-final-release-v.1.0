"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the server status every 3 seconds for up to 2 minutes while Stripe's webhook is in flight. */
export function RefreshWhilePending() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => { if (++n > 40) clearInterval(t); else router.refresh(); }, 3000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
