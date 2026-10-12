"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Native overflow regions remain reachable by keyboard, including dynamically rendered tables. */
export function KeyboardScrollRegions() {
 const path=usePathname(),params=useSearchParams();
 useEffect(()=>{
  let frame=0;
  const apply=()=>{frame=0;for(const el of document.querySelectorAll<HTMLElement>('.ws-table-wrap,.qw-steps,.wz-steps,.tp-steps,.pt-gantt,.pt-members,.ptm-asg,.ptm-week,.pm-tx,.pa-list table,.mb-toolbar')){
   const needs=['auto','scroll'].includes(getComputedStyle(el).overflowX)&&el.scrollWidth>el.clientWidth+1;
   if(needs&&!el.hasAttribute('tabindex')){el.tabIndex=0;el.dataset.pwaScrollRegion='true';}
   else if(!needs&&el.dataset.pwaScrollRegion==='true'){el.removeAttribute('tabindex');delete el.dataset.pwaScrollRegion;}
  }};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(apply);};schedule();
  const observer=new MutationObserver(schedule);const root=document.querySelector('main');if(root)observer.observe(root,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);};
 },[path,params]);
 return null;
}
