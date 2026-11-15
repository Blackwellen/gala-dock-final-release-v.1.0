import { NextResponse, type NextRequest } from "next/server";
import { getDestination } from "@/lib/auth";
import { loadPending } from "@/lib/legal/published";

/** Resolves the post-authentication destination on the server. At sign-in, changed legal documents come first (R3): the account is
 *  sent to /legal/updates, which must be completed for documents that already apply and can be deferred during a notice period. */
export async function GET(request: NextRequest) {
  const destination = await getDestination(request.nextUrl.searchParams.get("next"));
  const pending = destination.startsWith("/admin") || destination.startsWith("/legal/updates") ? [] : await loadPending();
  const target = pending.length ? `/legal/updates?next=${encodeURIComponent(destination)}` : destination;
  return NextResponse.redirect(new URL(target, request.url));
}
