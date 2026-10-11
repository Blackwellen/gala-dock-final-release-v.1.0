import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Verify Email · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/verify-email">) {
  return <AuthRoute screen="verify-email" searchParams={searchParams} />;
}
