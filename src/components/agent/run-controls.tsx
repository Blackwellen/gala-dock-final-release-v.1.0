"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { controlRun, confirmPlan } from "@/lib/agent/actions";

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
