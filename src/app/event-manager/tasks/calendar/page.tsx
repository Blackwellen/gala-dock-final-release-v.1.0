import { redirect } from "next/navigation";

// The Gantt/calendar view was moved out of the Tasks module into the
// dedicated Calendar module, where it operates on the same canonical task
// data. Preserve the old URL by redirecting into the new location.
export default function TaskCalendarRedirect() {
  redirect("/event-manager/calendar?view=gantt");
}
