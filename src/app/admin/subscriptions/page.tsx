import { requirePlatformAdmin } from "@/lib/admin";
import { SubscriptionsPageClient } from "./SubscriptionsPageClient";

export default async function SubscriptionsPage() {
  await requirePlatformAdmin();
  return <SubscriptionsPageClient />;
}
