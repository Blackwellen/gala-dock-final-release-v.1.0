import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

/** PNG QR code for the signed-in partner's referral link (RLS: partners_read returns only the caller's row). */
export async function GET(request: Request) {
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { data } = await sb.from("partners").select("referral_code").eq("user_id", user.id).neq("status", "terminated").limit(1).maybeSingle();
  const code = (data as { referral_code: string | null } | null)?.referral_code;
  if (!code) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const target = new URL(`/?ref=${encodeURIComponent(code)}`, url.origin).toString();
  const png = await QRCode.toBuffer(target, { type: "png", margin: 1, width: url.searchParams.get("download") ? 600 : 132, color: { dark: "#0d0e5f", light: "#ffffff" } });
  return new Response(new Uint8Array(png), { headers: {
    "Content-Type": "image/png", "Cache-Control": "private, max-age=300",
    ...(url.searchParams.get("download") ? { "Content-Disposition": `attachment; filename="gala-dock-referral-${code}.png"` } : {}),
  } });
}
