import { NextResponse } from "next/server";
import { LEGAL_DOCUMENTS, LEGAL_PACK } from "@/lib/legal/registry";
import { LEGAL_TEXTS } from "@/lib/legal/texts.generated";

/** The legal pack this deployment serves (slug, version, label, sha256 of the published body). scripts/legal/publish-pack.mjs reads it
 *  from the live site and refuses to publish (or send any notice) unless the live texts are exactly the ones being recorded. */
export function GET() {
  return NextResponse.json({
    pack: LEGAL_PACK,
    documents: LEGAL_DOCUMENTS.map(d => ({ slug: d.slug, version: d.version, label: d.label, previous: d.previous, sha256: LEGAL_TEXTS[d.slug]?.sha256 ?? null })),
  }, { headers: { "Cache-Control": "no-store" } });
}
