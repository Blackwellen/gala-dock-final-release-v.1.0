import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MfaSetupForm } from "./mfa-setup-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Two-factor authentication | Gala Dock" };

export default async function MfaSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/operator/login?next=/mfa/setup");

  return <MfaSetupForm />;
}
