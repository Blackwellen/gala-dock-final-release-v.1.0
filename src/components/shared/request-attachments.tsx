"use client";
import {useEffect,useRef,useState} from "react";
import {useKitToast} from "@/components/kit/client";
export type RequestAttachment={path:string;name:string};
/** Shared request/booking picker. Only the sanitized server upload route may issue file paths. */
export function RequestAttachments({files,onChange,onBusy}:{files:RequestAttachment[];onChange:(files:RequestAttachment[])=>void;onBusy?:(busy:boolean)=>void}) {
 const input=useRef<HTMLInputElement>(null),active=useRef<AbortController|null>(null);const [busy,setBusy]=useState(false);const toast=useKitToast();
 useEffect(()=>()=>{const controller=active.current;active.current=null;controller?.abort();},[]);
 const upload=async(file:File|undefined)=>{
  if(!file||busy)return;if(files.length>=6){toast("Attach up to six files.","error");return;}
  const controller=new AbortController();active.current=controller;const timer=window.setTimeout(()=>controller.abort(),30000);setBusy(true);onBusy?.(true);
  try{const form=new FormData();form.append("file",file);form.append("purpose","document");const response=await fetch("/api/uploads",{method:"POST",body:form,signal:controller.signal});const result=await response.json();if(!response.ok){toast(result.error??"Upload failed.","error");return;}onChange([...files,{path:result.path,name:result.name}]);}
  catch{if(active.current===controller)toast("Upload failed. Check your connection and try again.","error");}
  finally{window.clearTimeout(timer);if(active.current===controller){active.current=null;setBusy(false);onBusy?.(false);if(input.current)input.current.value="";}}
 };
 return <div className="k-field" style={{marginTop:16}}><span>Request attachments</span><small>PDF, PNG, JPG or WebP, up to 10 MB each. Shared with selected providers when you send.</small>
  <input ref={input} type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/>
  <button type="button" className="k-btn outline" disabled={busy||files.length>=6} onClick={()=>input.current?.click()}>{busy?"Uploading…":"Attach a file"}</button>
  {files.length>0&&<ul>{files.map(file=><li key={file.path} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{overflowWrap:"anywhere"}}>{file.name}</span><button type="button" className="k-btn ghost" aria-label={`Remove ${file.name}`} onClick={()=>onChange(files.filter(existing=>existing.path!==file.path))}>Remove</button></li>)}</ul>}
 </div>;
}
