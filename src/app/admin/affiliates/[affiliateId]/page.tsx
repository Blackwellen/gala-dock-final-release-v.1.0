import { requirePlatformAdmin } from "@/lib/admin";
import { AffiliateDetailPageClient } from "./AffiliateDetailPageClient";

export default async function AffiliateDetailPage() {
  await requirePlatformAdmin();
  return <AffiliateDetailPageClient />;
}
