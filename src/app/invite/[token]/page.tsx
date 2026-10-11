import type { Metadata } from "next";
import { AuthRoute } from "@/components/auth-route";

export const metadata: Metadata = { title: "Workspace invite · Gala Dock", robots: { index: false }, referrer: "no-referrer" };

export default async function Page({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return <AuthRoute screen="invite" token={token} searchParams={searchParams} />;
}
