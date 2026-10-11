import type { Metadata } from "next";
import { loadPromoter } from "../_data";
import { PromoterView } from "../_view";

export const metadata: Metadata = { title: "Promoter portal · Gala Dock", robots: { index: false, follow: false } };

/** A specific campaign when the promoter works on several events (ownership checked in loadPromoter; others 404). */
export default async function PromoterCampaignPage(props: PageProps<"/promoter/[promoterId]">) {
  const [{ promoterId }, sp] = await Promise.all([props.params, props.searchParams]);
  const data = await loadPromoter(promoterId);
  return <PromoterView data={data} view={typeof sp.view === "string" ? sp.view : undefined} basePath={`/promoter/${promoterId}`} />;
}
