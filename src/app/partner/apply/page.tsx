import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { House, FileText } from "lucide-react";
import "@/styles/portal-partner.css";
import { PortalShell, PortalChip } from "@/components/portal/shell";
import { requireUser } from "@/lib/auth";
import { untyped, one } from "@/lib/workspace/db";
import { COUNTRIES } from "@/lib/master-data";
import { CONNECT_SUPPORTED_COUNTRIES } from "@/lib/payments/connect-countries";
import { fmt } from "@/components/portal/format";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Apply to the partner programme · Gala Dock", robots: { index: false, follow: false } };

type Application = { id: string; status: "pending" | "approved" | "rejected" | "withdrawn"; created_at: string; decided_at: string | null; decision_reason: string | null; business_name: string };

/** Q68 (owner update 2026-11-14): affiliate partners sign themselves up; the partnerships team approves each application. */
export default async function PartnerApplyPage() {
  const { supabase, user } = await requireUser("/partner/apply");
  const sb = untyped(supabase);
  const [partner, last, profile, version] = await Promise.all([
    one<{ id: string }>(sb.from("partners").select("id").eq("user_id", user.id).neq("status", "terminated").limit(1).maybeSingle()),
    one<Application>(sb.from("partner_applications").select("id,status,created_at,decided_at,decision_reason,business_name").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()),
    one<{ full_name: string | null; avatar_url: string | null }>(sb.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle()),
    sb.rpc("partner_terms_version"),
  ]);
  if (partner) redirect("/partner");
  const name = profile?.full_name || user.email || "Applicant";
  const countries = COUNTRIES.map(c => ({ code: c.code, name: c.name, payouts: c.code in CONNECT_SUPPORTED_COUNTRIES }));
  return <PortalShell user={{ name, detail: user.email ?? "", avatar: profile?.avatar_url ?? null, signOut: true }}
    nav={[{ href: "/partner/apply", label: "Apply", icon: FileText, active: true }, { href: "/", label: "Gala Dock home", icon: House }]}
    portal={{ title: "Partner Programme", subtitle: "Apply to partner", thumb: "/assets/gd/oe-neon.webp" }} context={{ label: "Partner Programme", thumb: "/assets/gd/oe-neon.webp" }}
    links={{ messages: "/partner/apply", notifications: "/partner/apply", help: "/help" }} searchPlaceholder="Search help…">
    <div className="pr pr-apply">
      <header className="pr-head"><div><h1>Become a Gala Dock partner</h1><p>Refer event organisers, venues and suppliers and earn commission on their Gala Dock plans and credit packs.</p></div></header>
      {last?.status === "pending" ? <section className="pt-panel pr-full"><h2 className="pr-h2">Application received <PortalChip tone="amber" dot>Under review</PortalChip></h2>
        <p className="pr-sub">We received your application for {last.business_name} on {fmt(last.created_at)}. The partnerships team reviews applications within five working days and will email you the decision.</p></section>
      : <>
        {last?.status === "rejected" && <p className="pt-notice amber">Your previous application ({fmt(last.decided_at ?? last.created_at)}) wasn’t approved{last.decision_reason ? `: ${last.decision_reason}` : "."} You can apply again with updated details.</p>}
        <section className="pt-panel pr-full">
          <h2 className="pr-h2">How the programme works</h2>
          <ul className="pr-apply-facts">
            <li>Commission is a percentage of what referred workspaces pay for Gala Dock plans and credit packs, <b>excluding VAT</b>: 6% at grade 1, rising to 10% at grade 5 with more active referred accounts.</li>
            <li>Earnings clear <b>60 days</b> after the payment (to cover refunds and chargebacks) and are collected on a monthly statement. Refunds and lost chargebacks are deducted, even after payment.</li>
            <li>We pay by <b>Stripe</b> to your bank once your cleared balance reaches the minimum payout (currently £50); smaller balances roll over to the next month.</li>
            <li>We issue <b>self-billed statements</b> for your commission. If you’re VAT-registered in the UK, VAT is added on top.</li>
            <li>You’ll see totals and statuses for your referrals, never the names or details of the businesses you refer.</li>
          </ul>
        </section>
        <section className="pt-panel pr-full"><h2 className="pr-h2">Your application</h2>
          <ApplyForm email={user.email ?? ""} name={profile?.full_name ?? ""} countries={countries} termsVersion={(version.data as string | null) ?? "2026-10"} />
          <p className="pr-sub">Already a partner? <Link className="pt-link" href="/partner">Open the partner portal</Link></p>
        </section>
      </>}
    </div>
  </PortalShell>;
}
