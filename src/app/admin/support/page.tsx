import { requirePlatformAdmin } from "@/lib/admin";
import { SupportPageClient } from "./SupportPageClient";

export default async function SupportPage() {
  await requirePlatformAdmin();
  return <SupportPageClient />;
}
