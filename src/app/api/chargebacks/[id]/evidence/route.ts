import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, sameOrigin } from "@/lib/security";
import { gate } from "@/lib/files/service";
import { stripe, stripeKey } from "@/lib/stripe";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
// Stripe evidence file fields, in the order files are attached.
const FILE_FIELDS = ["evidence[service_documentation]", "evidence[customer_communication]", "evidence[receipt]", "evidence[uncategorized_file]"];

/**
 * DEC-107 chargeback evidence (seller is the merchant on a direct charge). The seller's owner, manager or finance member writes a
 * statement and attaches up to 4 private uploads (PDF/PNG/JPG, which must have passed the AV scan); the evidence is uploaded to
 * Stripe on the SELLER's connected account and attached to the dispute; `submit` sends it to the card issuer (final). Every
 * submission is recorded (text fingerprint, file names + SHA-256) and audited. Gala Dock never argues the dispute itself.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const { id } = await params;
  if (!/^(du|dp)_[A-Za-z0-9_]+$/.test(id)) return json({ error: "Dispute not found." }, 404);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Please sign in again." }, 401);
  if (!(await rateLimit(`chargeback-evidence:${user.id}`, 10, 600))) return json({ error: "Too many attempts. Please wait a few minutes." }, 429);
  const body = await request.json().catch(() => ({})) as { text?: string; files?: { path: string; name: string }[]; submit?: boolean };
  const text = String(body.text ?? "").trim().slice(0, 15000);
  if (text.length < 20) return json({ error: "Describe what was booked or bought and what was delivered (at least 20 characters)." }, 400);
  // RLS (stripe_disputes_seller_read) decides whether this user can see the dispute at all.
  const { data: d } = await sb.from("stripe_disputes" as never).select("stripe_dispute_id,stripe_account_id,status,livemode").eq("stripe_dispute_id", id).maybeSingle();
  const dispute = d as { stripe_dispute_id: string; stripe_account_id: string | null; status: string; livemode: boolean } | null;
  if (!dispute?.stripe_account_id) return json({ error: "Dispute not found." }, 404);
  if (!["needs_response", "warning_needs_response"].includes(dispute.status)) return json({ error: "This dispute no longer accepts evidence." }, 409);
  const admin = createAdminClient();
  const { data: ca } = await admin.from("connect_accounts").select("workspace_id").eq("stripe_account_id", dispute.stripe_account_id).maybeSingle();
  const workspaceId = (ca as { workspace_id: string } | null)?.workspace_id;
  if (!workspaceId) return json({ error: "Dispute not found." }, 404);
  const key = stripeKey();
  if (!key) return json({ error: "Payments are not configured in this environment." }, 503);

  const files = (body.files ?? []).filter(f => typeof f?.path === "string" && f.path.startsWith(`${user.id}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|pdf)$/i.test(f.path)).slice(0, FILE_FIELDS.length);
  const params_: Record<string, string> = { "evidence[uncategorized_text]": text, ...(body.submit ? { submit: "true" } : {}) };
  const recorded: { name: string; sha256: string; stripe_file: string }[] = [];
  for (const [i, f] of files.entries()) {
    const blocked = await gate(admin, "workspace-files", f.path);
    if (blocked) return json({ error: `“${f.name}” is still being checked for malware or is unavailable. Try again shortly.` }, 423);
    const { data: blob } = await admin.storage.from("workspace-files").download(f.path);
    if (!blob) return json({ error: `Couldn’t read “${f.name}”.` }, 404);
    const bytes = Buffer.from(await blob.arrayBuffer());
    const form = new FormData();
    form.set("purpose", "dispute_evidence");
    form.set("file", new Blob([bytes], { type: blob.type || "application/pdf" }), f.name.replace(/[^\w .()-]/g, "_").slice(0, 100));
    const res = await fetch("https://files.stripe.com/v1/files", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Stripe-Account": dispute.stripe_account_id }, body: form, signal: AbortSignal.timeout(30_000) });
    const up = await res.json().catch(() => ({})) as { id?: string };
    if (!res.ok || !up.id) return json({ error: "Stripe couldn’t accept one of the files. Use a PDF, PNG or JPG under 5 MB." }, 502);
    params_[FILE_FIELDS[i]!] = up.id;
    recorded.push({ name: f.name.slice(0, 120), sha256: createHash("sha256").update(bytes).digest("hex"), stripe_file: up.id });
  }
  try {
    const out = await stripe<{ id: string; status: string }>(`disputes/${encodeURIComponent(id)}`, params_, { stripeAccount: dispute.stripe_account_id, idempotencyKey: `evidence:${id}:${createHash("sha256").update(JSON.stringify(params_)).digest("hex").slice(0, 32)}` });
    await admin.from("chargeback_evidence_submissions" as never).insert({ stripe_dispute_id: id, workspace_id: workspaceId, submitted_by: user.id, text_sha256: createHash("sha256").update(text).digest("hex"),
      files: recorded, final: !!body.submit, stripe_status: out.status } as never);
    if (body.submit) await admin.from("stripe_disputes").update({ evidence_submitted_at: new Date().toISOString(), status: out.status, updated_at: new Date().toISOString() } as never).eq("stripe_dispute_id", id);
    await admin.from("audit_events").insert({ actor_id: user.id, actor_type: "user", workspace_id: workspaceId, event: body.submit ? "chargeback.evidence_submitted" : "chargeback.evidence_saved",
      metadata: { dispute: id, files: recorded.length } } as never);
    return json({ ok: true, status: out.status });
  } catch {
    return json({ error: "Stripe didn’t accept the evidence. Check the dispute is still open and try again." }, 502);
  }
}
