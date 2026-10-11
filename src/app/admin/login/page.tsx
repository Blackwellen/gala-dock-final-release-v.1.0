import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Activity, ScrollText } from "lucide-react";
import "@/styles/workspace.css";
import "@/styles/admin-login.css";
import { BrandLogo } from "@/components/workspace/shell";
import { getOptionalUser } from "@/lib/auth";
import { AdminLoginForm } from "./admin-login-form";

export const metadata: Metadata = { title: "Admin sign in · Gala Dock", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { reason } = await searchParams;
  const { supabase, user } = await getOptionalUser();
  if (user) {
    // Already signed in as an admin: requireRole("admin") on /admin handles any outstanding MFA step.
    const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (data) redirect("/admin");
  }
  return <main className="adm-login">
    <section className="adm-login-panel" aria-labelledby="adm-title">
      <BrandLogo />
      <span className="adm-badge"><ShieldCheck aria-hidden="true" />Platform Admin</span>
      <h1 id="adm-title">Staff sign in</h1>
      <p>Operational console for Gala Dock staff. Customer, Organizer and Provider accounts sign in on the <Link href="/login">main login</Link>.</p>
      <AdminLoginForm reason={typeof reason === "string" ? reason : undefined} />
    </section>
    <aside className="adm-login-side" aria-hidden="true">
      <div>
        <h2>One control plane.<br />Every action accountable.</h2>
        <ul>
          <li><ShieldCheck />Least-privilege roles per area</li>
          <li><Activity />Live marketplace, ticketing and payout health</li>
          <li><ScrollText />Reason-coded, audited interventions</li>
        </ul>
      </div>
    </aside>
  </main>;
}
