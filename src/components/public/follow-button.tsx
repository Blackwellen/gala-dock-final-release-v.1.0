"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bell, BellRing } from "lucide-react";
import { follow, unfollow } from "@/lib/promotion/actions";

/** Follow a city / category / series (Q23 follows). Signed-out visitors are sent to sign in and come back here. */
export function FollowButton({ kind, subject, label, initial, signedIn, next }: { kind: "city" | "category" | "series" | "organizer" | "venue" | "event"; subject: string; label: string; initial: boolean; signedIn: boolean; next: string }) {
  const [on, setOn] = useState(initial); const [pending, start] = useTransition(); const [err, setErr] = useState("");
  if (!signedIn) return <Link className="k-btn outline dir-follow" href={`/login?next=${encodeURIComponent(next)}`}><Bell size={15} aria-hidden />{label}</Link>;
  return <span className="dir-follow-wrap">
    <button type="button" className={`k-btn ${on ? "soft" : "outline"} dir-follow`} aria-pressed={on} disabled={pending}
      onClick={() => start(async () => { setErr(""); const r = on ? await unfollow(kind, subject) : await follow(kind, subject); if (r.ok) setOn(!on); else setErr(("error" in r && typeof r.error === "string" && r.error) || "Couldn’t update — try again."); })}>
      {on ? <BellRing size={15} aria-hidden /> : <Bell size={15} aria-hidden />}{on ? "Following" : label}
    </button>
    {err && <small role="alert" className="dir-err">{err}</small>}
  </span>;
}
