import { requirePlatformAdmin } from "@/lib/admin";
import { UserDetailPageClient } from "./UserDetailPageClient";

export default async function UserDetailPage() {
  await requirePlatformAdmin();
  return <UserDetailPageClient />;
}
