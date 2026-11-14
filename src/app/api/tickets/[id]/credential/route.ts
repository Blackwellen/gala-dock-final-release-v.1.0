import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { walletCredential } from "@/lib/tickets/credentials";

/**
 * Rotating wallet credential for the ticket holder (§51 / media §73). The holder check uses the user's RLS-scoped read;
 * the nonce is read server-side and never returned — only the signed, 30-second token is.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers });
  const { data: mine } = await sb.from("tickets").select("id,status,holder_id").eq("id", id).eq("holder_id", user.id).maybeSingle();
  if (!mine) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  if (mine.status !== "valid") return NextResponse.json({ status: mine.status }, { headers });
  const { data: t } = await untyped(createAdminClient() as never).from("tickets").select("qr_nonce,dispute_hold_at").eq("id", id).maybeSingle();
  // Owner 2026-11-14: a ticket whose card payment is disputed is on hold — no entry code until the dispute is decided.
  if (t?.dispute_hold_at) return NextResponse.json({ status: "on_hold" }, { headers });
  if (!t?.qr_nonce) return NextResponse.json({ error: "Ticket unavailable" }, { status: 409, headers });
  const c = walletCredential(id, t.qr_nonce);
  return NextResponse.json({ status: "valid", payload: c.payload, expiresInMs: c.expiresInMs }, { headers });
}
