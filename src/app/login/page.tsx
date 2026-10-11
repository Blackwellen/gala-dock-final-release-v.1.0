import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Log in · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/login">) {
  return <AuthRoute screen="login" searchParams={searchParams} />;
}
