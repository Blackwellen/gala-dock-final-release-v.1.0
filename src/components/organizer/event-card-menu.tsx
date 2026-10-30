"use client";
import {useEffect,useRef,type ReactNode} from 'react';
import {Ellipsis} from 'lucide-react';

/** Native disclosure with ordinary links; Escape restores focus and outside interaction dismisses it. */
export function EventCardMenu({name,children}:{name:string;children:ReactNode}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const closeOutside=(e:PointerEvent)=>{const el=ref.current;if(el?.open&&e.target instanceof Node&&!el.contains(e.target))el.open=false;};
  document.addEventListener('pointerdown',closeOutside);return()=>document.removeEventListener('pointerdown',closeOutside);
 },[]);
 return <details ref={ref} className="omh-event-menu" name="upcoming-event-actions" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false;}} onKeyDown={e=>{if(e.key==='Escape'&&e.currentTarget.open){e.preventDefault();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
  <summary aria-label={`Actions for ${name}`}><Ellipsis size={22} aria-hidden="true" /></summary>{children}
 </details>;
}
