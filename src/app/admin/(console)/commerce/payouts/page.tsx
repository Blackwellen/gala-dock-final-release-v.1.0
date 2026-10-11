import type { Metadata } from "next";
import "@/styles/admin-b.css";
import "@/styles/admin-b-commerce.css";
import { CommerceView } from "../view";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage(props: PageProps<"/admin/commerce/payouts">) {
  return <CommerceView sp={await props.searchParams} tab="payouts" />;
}
