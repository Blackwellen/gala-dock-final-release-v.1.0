import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$/i;

/**
 * DEC-107 case pack (playbook §2): a downloadable JSON file a party gives to an ADR provider or court — booking terms, payments,
 * timeline with SHA-256 fingerprints of every statement and evidence file, the non-binding recommendation, settlement offers and
 * the resolution route for this amount and customer type. Parties and staff only (dispute_case_pack checks); file contents are
 * not included, only their fingerprints.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data, error } = await supabase.rpc("dispute_case_pack" as never, { p_dispute: id } as never);
  if (error || !data) return NextResponse.json({ error: /not_authorized/.test(error?.message ?? "") ? "Not allowed" : "Not found" }, { status: /not_authorized/.test(error?.message ?? "") ? 403 : 404 });
  const pack = data as { dispute: { reference: string }; timeline: { files: { name: string; sha256: string | null; path?: string }[] }[] };
  // Fingerprint evidence files the database only knows by path (visible entries of this dispute only; RLS applied above).
  const { data: entries } = await supabase.from("booking_dispute_entries" as never).select("files").eq("dispute_id", id);
  const paths = new Map<string, string>();
  for (const e of (entries ?? []) as { files: { path: string; name: string }[] | null }[]) for (const f of e.files ?? []) if (PATH.test(f.path)) paths.set(f.name, f.path);
  const storage = createAdminClient().storage.from("workspace-files");
  for (const t of pack.timeline ?? []) for (const f of t.files ?? []) {
    if (f.sha256) continue;
    const path = paths.get(f.name);
    if (!path) continue;
    const { data: blob } = await storage.download(path);
    if (blob) f.sha256 = createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex");
  }
  const body = JSON.stringify(pack, null, 2);
  const name = `gala-dock-case-pack-${(pack.dispute?.reference ?? id).replace(/[^\w-]/g, "_")}.json`;
  return new NextResponse(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store", "X-Content-SHA256": createHash("sha256").update(body).digest("hex") } });
}
