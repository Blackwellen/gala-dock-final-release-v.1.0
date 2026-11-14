import { redirect } from 'next/navigation';
import { getOrganizer } from '@/lib/data/context';
import { getProEvent } from '@/lib/data/event';
import { parseStep } from '@/lib/ui/wizard';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
 const ctx=await getOrganizer();const event=await getProEvent(ctx,(await params).id);const sp=await searchParams;
 const query=new URLSearchParams({event:event.id,step:String(parseStep(sp.step,3))});if(sp.boost) query.set('boost',sp.boost);
 redirect('/organizer/promotions/new?'+query);
}
