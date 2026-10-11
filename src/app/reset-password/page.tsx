import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Reset Password · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/reset-password">) {
  return <AuthRoute screen="reset-password" searchParams={searchParams} />;
}
