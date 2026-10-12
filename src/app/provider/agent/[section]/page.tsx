import { notFound,redirect } from 'next/navigation';
export default async function Page({params}:{params:Promise<{section:string}>}) {
 const {section}=await params; if(!['routines','approvals','history'].includes(section)) notFound();
 redirect(`/provider/agent?tab=${section}`);
}
