import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Entry point referenced by the spec (/affiliate/apply). Signed-in users go
// straight into the real application wizard; signed-out visitors are sent to
// sign up first, then back here.
export default async function AffiliateApplyEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signup?next=/onboarding/affiliate/apply");
  }
  redirect("/onboarding/affiliate/apply");
}
