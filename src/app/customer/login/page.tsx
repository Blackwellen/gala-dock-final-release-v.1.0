import { Suspense } from "react";
import type { Metadata } from "next";
import { CustomerLoginForm } from "./CustomerLoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in | Gala Dock" };

export default function CustomerLoginPage() {
  return (
    <Suspense>
      <CustomerLoginForm />
    </Suspense>
  );
}
