import type { Metadata } from "next";
import "@/styles/admin-b.css";
import "@/styles/admin-b-trust.css";
import { TrustView } from "./view";

export const metadata: Metadata = { title: "Trust & Safety" };

export default async function TrustPage(props: PageProps<"/admin/trust">) {
  return <TrustView sp={await props.searchParams} />;
}
