"use client";
import Link from 'next/link';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {resaleTicket} from '@/lib/actions/tickets';
export function ResaleReview({ticketId}:{ticketId:string}){
 const [agreed,setAgreed]=useState(false),[error,setError]=useState(''),[pending,start]=useTransition();const router=useRouter();
 return <form className="ar-controls" onSubmit={e=>{e.preventDefault();if(!agreed)return;start(async()=>{setError('');if(!navigator.onLine){setError('Reconnect before listing your ticket.');return;}try{const r=await resaleTicket(ticketId,false);if(r.ok)router.push(`/account/tickets/${ticketId}`);else setError(r.error||'Could not list this ticket.');}catch{setError('Could not reach Gala Dock. Reconnect and check your ticket status before retrying.');}});}}>
 <label style={{width:'100%',display:'flex',gap:10,alignItems:'center',minHeight:44}}><input type="checkbox" required checked={agreed} onChange={e=>setAgreed(e.target.checked)} />I understand the price, pending payout and admission changes.</label><Link href="?step=1">Back</Link><button type="submit" disabled={!agreed||pending}>{pending?'Listing…':'Confirm and list'}</button>{error&&<p role="alert">{error}</p>}
 </form>;
}
