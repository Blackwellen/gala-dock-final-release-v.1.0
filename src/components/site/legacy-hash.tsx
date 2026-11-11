"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old landing anchors (#pricing, #roles, #how-it-works, #professionals, #marketplace) were sections of the previous one-page
 *  site. Fragments never reach the server, so they are forwarded here to the pages that now own that content. */
const MAP: Record<string, string> = { "#pricing": "/pricing", "#roles": "/#three-ways", "#how-it-works": "/build-an-event", "#professionals": "/organisers", "#marketplace": "/providers" };

export function LegacyHash() {
  const router = useRouter();
  useEffect(() => {
    const to = MAP[window.location.hash];
    if (to && to.startsWith("/#")) document.getElementById(to.slice(2))?.scrollIntoView();
    else if (to) router.replace(to);
  }, [router]);
  return null;
}
