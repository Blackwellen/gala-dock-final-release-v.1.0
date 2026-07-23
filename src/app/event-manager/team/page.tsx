import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TeamIndexRedirect() {
  redirect("/event-manager/team/workload");
}
