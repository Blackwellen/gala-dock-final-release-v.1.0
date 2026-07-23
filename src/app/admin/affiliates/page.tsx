import { requirePlatformAdmin } from "@/lib/admin";
import { AffiliatesPageClient } from "./AffiliatesPageClient";

export default async function AffiliatesPage() {
  await requirePlatformAdmin();
  return <AffiliatesPageClient />;
}
