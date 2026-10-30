import { getOrganizer } from "@/lib/data/context";
import { Crumbs } from "@/components/kit";
import { MyShifts } from "@/components/team/my-shifts";

export const metadata = { title: "My shifts" };

/** Staff logins (crew linked to this account): their own shifts, check-in and leave. */
export default async function OrganizerMyShifts() {
  const ctx = await getOrganizer("/organizer/team/my-shifts");
  return <>
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Team", href: "/organizer/team" }, { label: "My shifts" }]} />
    <MyShifts client={ctx.supabase} userId={ctx.user.id} />
  </>;
}
