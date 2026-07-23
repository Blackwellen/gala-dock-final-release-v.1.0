import { Suspense } from "react";
import type { Metadata } from "next";
import { OperatorLoginForm } from "./OperatorLoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operator sign in | Gala Dock" };

export default function OperatorLoginPage() {
  return (
    <Suspense>
      <OperatorLoginForm />
    </Suspense>
  );
}
