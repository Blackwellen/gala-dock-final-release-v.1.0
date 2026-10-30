"use client";
import Link from "next/link";
import { useTransition } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Preserve the workspace shell and give failed server pages an accessible recovery path. */
export default function PwaRouteError({error,retry}:{error:Error & {digest?:string};retry:()=>void}) {
 const [pending,startTransition]=useTransition();
 return <section className="pwa-route-state" role="alert" aria-labelledby="pwa-route-error-title">
  <AlertTriangle size={32} aria-hidden="true"/><h1 id="pwa-route-error-title">This page could not load</h1>
  <p>Check your connection and try again. Your saved records are still available when the connection returns.</p>
  <div><button className="k-btn primary" disabled={pending} onClick={()=>startTransition(()=>retry())}><RefreshCw size={17} aria-hidden="true"/>{pending?"Trying again…":"Try again"}</button><Link className="k-btn outline" href="/continue">Return to your workspace</Link></div>
  {error.digest&&<small>Support reference: {error.digest}</small>}
 </section>;
}
