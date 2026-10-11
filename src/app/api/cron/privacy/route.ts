import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";

export const maxDuration = 60;
const authorised = (h: string | null) => {
  const secret = process.env.CRON_SECRET; if (!secret || !h) return false;
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${secret}`); return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Account deletion worker (release spec §91). Runs daily. Accounts past the 14-day grace period are erased unless a blocker applies
 * (the user is told what to resolve). Erasure de-identifies the auth identity too: the email is replaced, metadata cleared and the
 * account banned so it can never sign in again; retained financial/audit rows keep only the opaque user id.
 */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createAdminClient(), db = untyped(admin as never);
  const { data: due } = await db.rpc("due_deletions");
  const out = { erased: 0, blocked: 0, failed: 0 };
  for (const d of (due ?? []) as { user_id: string }[]) {
    try {
      const { data: blockers } = await db.rpc("deletion_blockers", { p_user: d.user_id });
      if ((blockers ?? []).length) {
        out.blocked++;
        const { data: recent } = await db.from("notifications").select("id").eq("user_id", d.user_id).eq("title", "Your account deletion is on hold").gt("created_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(1);
        if (!recent?.length) await db.from("notifications").insert({ user_id: d.user_id, kind: "security", title: "Your account deletion is on hold",
          body: (blockers as { detail: string }[]).map(b => b.detail).join(" ").slice(0, 900), link: "/account?tab=security#delete" });
        continue;
      }
      const { data: manifest, error } = await db.rpc("erase_user_data", { p_user: d.user_id });
      if (error) throw new Error(error.message);
      const { error: authErr } = await admin.auth.admin.updateUserById(d.user_id, { email: `deleted+${d.user_id}@users.invalid`, user_metadata: {}, app_metadata: { deleted: true }, ban_duration: "876000h" });
      if (authErr) throw new Error(authErr.message);
      const { data: open } = await db.from("privacy_requests").select("id").eq("user_id", d.user_id).eq("kind", "erasure").not("status", "in", "(completed,refused,withdrawn)").limit(1);
      if (open?.length) await db.from("privacy_requests").update({ status: "completed", completed_at: new Date().toISOString(), outcome: JSON.stringify(manifest).slice(0, 1000), requester_email: "erased" }).eq("id", open[0].id);
      else await db.from("privacy_requests").insert({ user_id: d.user_id, requester_email: "erased", kind: "erasure", status: "completed", completed_at: new Date().toISOString(), outcome: JSON.stringify(manifest).slice(0, 1000), detail: "Self-service account deletion" });
      out.erased++;
    } catch (e) {
      out.failed++;
      await db.from("audit_events").insert({ actor_type: "system", event: "privacy.erasure_failed", metadata: { user: d.user_id, error: (e as Error).message.slice(0, 200) } });
    }
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
