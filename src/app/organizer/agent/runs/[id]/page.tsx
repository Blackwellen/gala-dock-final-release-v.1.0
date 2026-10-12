import { AgentRunDetail } from "@/components/agent/run-detail";
export const metadata={title:'Agent run'};
export default async function Page({params}:{params:Promise<{id:string}>}) { return <AgentRunDetail surface="organizer" id={(await params).id} />; }
