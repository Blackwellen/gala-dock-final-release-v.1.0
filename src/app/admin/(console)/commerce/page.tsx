import type { Metadata } from "next";
import "@/styles/admin-b.css";
import "@/styles/admin-b-commerce.css";
import { CommerceView } from "./view";

export const metadata: Metadata = { title: "Commerce" };

export default async function CommercePage(props: PageProps<"/admin/commerce">) {
  return <CommerceView sp={await props.searchParams} />;
}
