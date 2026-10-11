import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit, sameOrigin } from "@/lib/security";
import { hashRecoveryCode } from "@/lib/mfa/hash";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Redeems a recovery code (release spec §7–8). The caller has signed in with their password (aal1) but lost their authenticator.
 * A valid unused code is consumed, all of the user's factors are removed, the user is notified, and they must enrol a new
 * authenticator. Rate-limited per user and IP; responses don't reveal whether codes exist.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Sign in with your password first." }, 401);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`mfa-recover:${user.id}`, 5, 900)) || !(await rateLimit(`mfa-recover-ip:${ip}`, 20, 900))) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const body = await request.json().catch(() => null) as { code?: string } | null;
  const code = String(body?.code ?? "").trim();
  if (!/^[A-Za-z0-9-]{8,14}$/.test(code)) return json({ error: "That recovery code isn’t valid." }, 400);
  const admin = createAdminClient(), db = untyped(admin as never);
  // Platform admins can't self-recover: another administrator must verify them and reset the factor (spec §6–7).
  const { data: pa } = await db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (pa) return json({ error: "Administrator accounts can’t use recovery codes. Ask another platform administrator to verify you and reset your authenticator." }, 403);
  const { data: used } = await db.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("code_hash", hashRecoveryCode(code)).is("used_at", null).select("id");
  if (!used?.length) {
    await db.from("audit_events").insert({ actor_id: user.id, actor_type: "user", event: "mfa.recovery_failed", metadata: { ip } });
    return json({ error: "That recovery code isn’t valid or has already been used." }, 400);
  }
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
  await db.from("mfa_recovery_codes").delete().eq("user_id", user.id).is("used_at", null);
  await db.from("audit_events").insert({ actor_id: user.id, actor_type: "user", event: "mfa.recovered_with_code", metadata: { ip, factors_removed: factors?.factors?.length ?? 0 } });
  await db.from("notifications").insert({ user_id: user.id, kind: "security", title: "A recovery code was used on your account",
    body: "Your authenticator was removed. Set up a new one now. If this wasn’t you, contact support immediately.", link: "/account?tab=security" });
  return json({ ok: true, next: "/account?tab=security&mfa=setup" });
}
