"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Native overflow regions remain reachable by keyboard, including dynamically rendered tables. */
export function KeyboardScrollRegions() {
 const path=usePathname(),params=useSearchParams();
 // Tab strips and wizard step rows scroll sideways on phones and tablets. Bring the active tab / current step into view inside its
 // own strip (scrollLeft only, never the page), so "Settings › Marketplace" or "step 4 of 6" is not left cut off at the edge.
 useEffect(()=>{
  const reveal=()=>{
   for(const cur of document.querySelectorAll<HTMLElement>(':is([class*="tabs"],[role="tablist"],[class*="-seg"],ol[class*="steps"]) > :is([aria-current],[aria-selected="true"],.on,[data-state="current"],[data-state="on"],[data-st="on"])')){
    const strip=cur.parentElement;if(!strip||strip.scrollWidth<=strip.clientWidth+1||!['auto','scroll'].includes(getComputedStyle(strip).overflowX))continue;
    const s=strip.getBoundingClientRect(),c=cur.getBoundingClientRect();
    if(c.left<s.left||c.right>s.right)strip.scrollLeft+=c.left-s.left-(s.width-c.width)/2;
   }
  };
  // again after a rotation / window resize: a strip that fitted in landscape can start scrolling in portrait
  // (a second pass catches wizards whose step row mounts after client state loads)
  let t=window.setTimeout(reveal,120);const late=window.setTimeout(reveal,800);const onResize=()=>{clearTimeout(t);t=window.setTimeout(reveal,150);};
  window.addEventListener('resize',onResize);
  return()=>{clearTimeout(t);clearTimeout(late);window.removeEventListener('resize',onResize);};
 },[path,params]);
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
