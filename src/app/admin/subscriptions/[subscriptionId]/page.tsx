import { requirePlatformAdmin } from "@/lib/admin";
import { SubscriptionDetailPageClient } from "./SubscriptionDetailPageClient";

export default async function SubscriptionDetailPage() {
  await requirePlatformAdmin();
  return <SubscriptionDetailPageClient />;
}
