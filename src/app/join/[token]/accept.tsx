"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptPortalInvite } from "@/lib/partners/invite-actions";

export function AcceptInvite({ token, email, portal }: { token: string; email: string; portal: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <div className="pr-join-actions">
    <p>Signed in as <b>{email}</b>.</p>
    <button type="button" className="pt-btn primary" disabled={pending} onClick={() => start(async () => {
      setError("");
      const r = await acceptPortalInvite(token);
      if (!r.ok) { setError(r.error); return; }
      router.push(r.next);
    })}>{pending ? "Accepting…" : `Accept and open the ${portal}`}</button>
    {error && <p className="pt-notice red" role="alert">{error}</p>}
  </div>;
}
