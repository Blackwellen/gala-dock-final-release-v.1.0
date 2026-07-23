import { Suspense } from "react";
import type { Metadata } from "next";
import { AffiliateLoginForm } from "./AffiliateLoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Affiliate Sign In" };

export default function AffiliateLoginPage() {
  return (
    <Suspense>
      <AffiliateLoginForm />
    </Suspense>
  );
}
