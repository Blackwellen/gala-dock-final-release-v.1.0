import type { Metadata } from "next";
import { loadPromoter } from "./_data";
import { PromoterView } from "./_view";

export const metadata: Metadata = { title: "Promoter portal · Gala Dock", robots: { index: false, follow: false } };

export default async function PromoterPage(props: PageProps<"/promoter">) {
  const sp = await props.searchParams;
  const data = await loadPromoter();
  return <PromoterView data={data} view={typeof sp.view === "string" ? sp.view : undefined} basePath="/promoter" />;
}
