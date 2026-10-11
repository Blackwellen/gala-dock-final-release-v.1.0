import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Register · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/register">) {
  return <AuthRoute screen="register" searchParams={searchParams} />;
}
