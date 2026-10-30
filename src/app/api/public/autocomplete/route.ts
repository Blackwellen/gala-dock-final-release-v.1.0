import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/security";
import { ipHash } from "@/lib/comms/public";
import { publicAutocomplete } from "@/lib/search/public";

/** Q06 signed-out autocomplete: public titles + master-data category labels (Q02 spellings). GET /api/public/autocomplete?q= */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });
  if (!(await rateLimit(`public-ac:${ipHash(request)}`, 240, 60))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  try {
    const r = await publicAutocomplete(q);
    return NextResponse.json({ suggestions: r.value }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unavailable right now." }, { status: 503 }); }
}
