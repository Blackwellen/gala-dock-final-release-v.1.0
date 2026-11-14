import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "@/styles/kit.css";
import { getProvider } from "@/lib/provider/context";
import { MyShifts } from "@/components/team/my-shifts";

export const metadata: Metadata = { title: "My shifts" };

/** Staff logins of a provider team (crew linked to this account): their own shifts, check-in and leave. */
export default async function ProviderMyShifts() {
  const ctx = await getProvider();
  return <>
    <Link href="/provider/team" className="ws-back"><ArrowLeft aria-hidden="true" />Back to Team</Link>
    <div className="k-root" style={{ background: "transparent" }}><MyShifts client={ctx.db} userId={ctx.userId} /></div>
  </>;
}
