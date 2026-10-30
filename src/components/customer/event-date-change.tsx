"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, AlertTriangle, Check, Loader2 } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { changeEventDate, dateChangeImpact, type DateImpact } from "@/lib/actions/build";

export function EventDateDialog({ eventId, open, onClose }: { eventId:string;open:boolean;onClose:()=>void }) {
 const [date,setDate]=useState(""); const [impact,setImpact]=useState<DateImpact|null>(null); const [error,setError]=useState(""); const { run,pending }=useAction(); const revision=useRef(0);
 const check=async()=>{ const version=revision.current;setError("");setImpact(null); const result=await run(()=>dateChangeImpact(eventId,date),{ refresh:false }); if(version!==revision.current)return; if(result.ok)setImpact(result.data??null);else setError(result.error??"Could not check this date."); };
 return <Dialog open={open} onClose={onClose} title="Change event date" sub="Check existing commitments before confirming a new date.">
  <form className="k-col" style={{gap:12}} onSubmit={e=>{e.preventDefault();void check();}}>
   <label className="k-field"><span>New date</span><input className="k-input" type="date" required value={date} onChange={e=>{revision.current++;setDate(e.target.value);setImpact(null);setError("");}} /></label>
   <button className="k-btn outline" disabled={!date||pending}>{pending&&<Loader2 size={16} className="k-spin"/>}Check date impact</button>
   {error&&<p className="k-notice red" role="alert">{error}</p>}
   {impact&&<div role="status">{impact.blockers.length ? <div className="k-notice amber"><AlertTriangle size={18}/><div><ul style={{paddingLeft:18,margin:0}}>{impact.blockers.map(line=><li key={line}>{line}</li>)}</ul><Link className="k-link" href={`/account/events/${eventId}/build`}>Review provider commitments</Link></div></div> : <p className="k-notice green"><Check size={18}/>No ticket or provider commitments prevent this date change.</p>}
    {impact.items.length>0&&<ul>{impact.items.map((item,i)=><li key={i}><b>{item.title}</b><p>{item.note}</p></li>)}</ul>}
   </div>}
   <div className="k-row" style={{justifyContent:"flex-end",flexWrap:"wrap"}}><button className="k-btn ghost" type="button" onClick={onClose}>Cancel</button><button className="k-btn primary" type="button" disabled={!date||!impact||!!impact.blockers.length||pending} onClick={async()=>{const result=await run(()=>changeEventDate(eventId,date));if(result.ok)onClose();else setError(result.error??"Could not change the date.");}}>Confirm new date</button></div>
  </form>
 </Dialog>;
}
export function EventDateChange({eventId,initialOpen=false}:{eventId:string;initialOpen?:boolean}) {
 const [open,setOpen]=useState(initialOpen);
 return <><button className="k-btn outline sm" onClick={()=>setOpen(true)}>Check new dates <ArrowRight size={12}/></button><EventDateDialog eventId={eventId} open={open} onClose={()=>setOpen(false)}/></>;
}
