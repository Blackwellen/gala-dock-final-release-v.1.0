import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-redirect";

export const dynamic = "force-dynamic";

// Legacy compatibility route. The workspace login used to live at /login with a
// client-side persona toggle (organizer/venue/supplier/customer); it now lives at
// /operator/login (redesigned, operator-only) with /customer/login split out
// separately. Old links/bookmarks to /login keep working via this redirect.
export default async function LegacyLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  redirect(next ? `/operator/login?next=${encodeURIComponent(next)}` : "/operator/login");
}
