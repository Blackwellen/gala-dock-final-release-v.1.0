import type { Metadata } from "next";
import "@/styles/admin-b.css";
import "@/styles/admin-b-trust.css";
import { TrustView } from "../view";

export const metadata: Metadata = { title: "Disputes" };

export default async function DisputesPage(props: PageProps<"/admin/trust/disputes">) {
  return <TrustView sp={await props.searchParams} disputes />;
}
