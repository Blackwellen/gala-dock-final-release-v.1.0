import { NextResponse, type NextRequest } from "next/server";
import { getDestination } from "@/lib/auth";

/** Resolves the post-authentication destination on the server. */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(await getDestination(request.nextUrl.searchParams.get("next")), request.url));
}
