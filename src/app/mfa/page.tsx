import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Two-step verification · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/mfa">) {
  return <AuthRoute screen="mfa" searchParams={searchParams} />;
}
