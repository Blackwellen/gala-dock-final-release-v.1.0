"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { controlRun, confirmPlan } from "@/lib/agent/actions";
import { isTyping } from "@/lib/ui/editing";

/**
 * Q53: live run log. While the worker is planning or executing, the run page re-fetches itself every few seconds (visible tab
 * only, backing off to 30 s), so steps, outputs and refusals appear without a manual reload. Stops once the run settles.
 */
const LIVE = ["queued", "planning", "running", "retrying"];
export function RunLiveRefresh({ status }: { status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!LIVE.includes(status)) return;
    let delay = 4000, t: ReturnType<typeof setTimeout>;
    const tick = () => { if (document.visibilityState === "visible" && navigator.onLine && !isTyping()) router.refresh(); delay = Math.min(delay * 1.5, 30_000); t = setTimeout(tick, delay); };
    t = setTimeout(tick, delay);
    return () => clearTimeout(t);
  }, [status, router]);
  return LIVE.includes(status) ? <p className="ar-note" role="status" aria-live="polite">Gala Agent is working on this — the page updates automatically.</p> : null;
}

export function RunControls({ id, status, canControl }: { id: string; status: string; canControl: boolean }) {
  const [pending,start]=useTransition(), [error,setError]=useState(""); const router=useRouter();
  const act=(action:"pause"|"resume"|"cancel"|"confirm")=>start(async()=>{
    setError("");
    if(!navigator.onLine){setError("Reconnect before changing this run.");return;}
    try { const result=action==="confirm" ? await confirmPlan(id) : await controlRun(id,action);
      if(result.ok) router.refresh(); else setError(result.error);
    } catch { setError("Could not reach Gala Dock. Reconnect and refresh the run before retrying."); }
  });
  if(!canControl || ["completed","cancelled","failed"].includes(status)) return null;
  return <div className="ar-controls">
    {status==="awaiting_plan_confirmation" && <button type="button" disabled={pending} onClick={()=>act("confirm")}>Confirm plan</button>}
    <button type="button" disabled={pending} onClick={()=>act(status==="paused"?"resume":"pause")}>{status==="paused"?"Resume":"Pause"}</button>
    <button type="button" disabled={pending} onClick={()=>act("cancel")}>Cancel run</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
