import { AgentRunDetail } from "@/components/agent/run-detail";
export const metadata={title:'Agent run'};
export default async function Page({params}:{params:Promise<{id:string}>}) { return <AgentRunDetail surface="provider" id={(await params).id} />; }
