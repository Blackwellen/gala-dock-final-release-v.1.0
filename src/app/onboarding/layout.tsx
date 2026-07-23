import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/onboarding/account");
  }

  return (
    <div className="min-h-full bg-surface-50 flex flex-col">
      <header className="h-16 bg-white border-b border-surface-200 flex items-center px-6">
        <Image src="/gala-dock-logo.png" alt="Gala Dock" width={120} height={32} priority />
      </header>
      <div className="flex-1 flex flex-col items-center justify-start py-10 px-4">
        {children}
      </div>
    </div>
  );
}
