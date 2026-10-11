import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Forgot Password · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/forgot-password">) {
  return <AuthRoute screen="forgot-password" searchParams={searchParams} />;
}
