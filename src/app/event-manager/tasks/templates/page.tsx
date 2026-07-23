import { redirect } from "next/navigation";

// Templates now live inside the full Tasks shell as a tab, not a disconnected
// page. Preserve the old URL by redirecting into the canonical tab route.
export default function TaskTemplatesRedirect() {
  redirect("/event-manager/tasks?tab=templates&view=grid");
}
