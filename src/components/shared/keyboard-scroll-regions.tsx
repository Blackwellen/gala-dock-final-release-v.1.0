"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Native overflow regions remain reachable by keyboard, including dynamically rendered tables. */
export function KeyboardScrollRegions() {
 const path=usePathname(),params=useSearchParams();
 useEffect(()=>{
  let frame=0,active=true;
  // Streamed server HTML can arrive before React hydrates it; changing its attributes then causes a hydration mismatch
  // (seen on /organizer/events). Only touch nodes React already owns, and look again shortly for the rest.
  const owned=(el:HTMLElement)=>Object.keys(el).some(k=>k.startsWith('__reactFiber$'));
  let retry=0,tries=0;
  const apply=()=>{frame=0;let waiting=false;for(const el of document.querySelectorAll<HTMLElement>('main section,main ol,main ul,.k-table-wrap,.pr-c,.aa-table-scroll,.adb-table,.adb-table-wrap,.ws-app.admin section > table,.ws-table-wrap,.ws-table-scroll,.qw-steps,.wz-steps,.tp-steps,.pt-gantt,.pt-members,.ptm-asg,.ptm-week,.ptm-cal,.pm-tx,.pa-list table,.mb-toolbar,.ps-tabs')){
   if(!owned(el)){waiting=true;continue;}
   const style=getComputedStyle(el);const needs=(['auto','scroll'].includes(style.overflowX)&&el.scrollWidth>el.clientWidth+1)||(['auto','scroll'].includes(style.overflowY)&&el.scrollHeight>el.clientHeight+1);
   if(needs&&!el.hasAttribute('tabindex')){el.tabIndex=0;el.dataset.pwaScrollRegion='true';}
   else if(!needs&&el.dataset.pwaScrollRegion==='true'){el.removeAttribute('tabindex');delete el.dataset.pwaScrollRegion;}
  }
  if(waiting&&active&&!retry&&tries<40){tries++;retry=window.setTimeout(()=>{retry=0;schedule();},250);}};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(apply);};schedule();
  // The initial loading boundary can replace main itself after this effect runs.
  // Observe the stable body so streamed tables and dialogs are included as they arrive.
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
  // Fonts can change intrinsic table widths without changing DOM children.
  void document.fonts.ready.then(()=>{if(active)schedule();});document.fonts.addEventListener('loadingdone',schedule);
  window.addEventListener('resize',schedule);return()=>{active=false;observer.disconnect();cancelAnimationFrame(frame);clearTimeout(retry);window.removeEventListener('resize',schedule);document.fonts.removeEventListener('loadingdone',schedule);};
 },[path,params]);
 return null;
}
