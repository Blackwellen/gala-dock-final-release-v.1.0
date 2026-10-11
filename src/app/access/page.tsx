import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Secure access · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/access">) {
  return <AuthRoute screen="access" searchParams={searchParams} />;
}
