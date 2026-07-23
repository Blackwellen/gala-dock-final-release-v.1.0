import { requirePlatformAdmin } from "@/lib/admin";
import { UsersPageClient } from "./UsersPageClient";

export default async function UsersPage() {
  await requirePlatformAdmin();
  return <UsersPageClient />;
}
