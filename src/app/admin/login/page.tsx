import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminLoginForm } from "./AdminLoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Platform Admin Sign In" };

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
