"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptTransfer } from "@/lib/tickets/actions";

export function AcceptTransfer({ token }: { token: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  return <>
    <button className="mk-btn primary" disabled={pending} onClick={() => start(async () => { const r = await acceptTransfer(token); if (!r.ok) setError(r.error); else router.push(`/account/tickets/${r.data}`); })}>{pending ? "Accepting…" : "Accept ticket"}</button>
    {error && <p className="mk-error" role="alert">{error}</p>}
  </>;
}
