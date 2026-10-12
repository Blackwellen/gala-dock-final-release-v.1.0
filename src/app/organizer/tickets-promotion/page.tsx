import { redirect } from 'next/navigation';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const query=new URLSearchParams();for(const [k,v] of Object.entries(await searchParams)) for(const value of Array.isArray(v)?v:v?[v]:[]) query.append(k,value);
 redirect(`/organizer/tickets${query.size?'?'+query:''}`);
}
