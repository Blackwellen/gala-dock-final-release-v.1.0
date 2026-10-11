import { getAdmin } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";

/** CSV export of partners (RLS: partners permission). */
export async function GET() {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("partners")) return new Response("Forbidden", { status: 403 });
  const list = await rows<Record<string, unknown> & { details: Record<string, unknown> }>(ctx.db.from("partners").select("name,kind,status,referral_code,commission_bps,referrals,eligible_revenue,earned,paid,created_at,details").order("created_at", { ascending: false }));
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const body = [["name", "type", "status", "referral_code", "commission_pct", "referrals", "eligible_revenue", "earned", "paid", "joined"].join(","),
    ...list.map(p => [p.name, p.details?.type ?? p.kind, p.status, p.referral_code, Number(p.commission_bps) / 100, p.referrals, p.eligible_revenue, p.earned, p.paid, p.created_at].map(esc).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="gala-dock-partners.csv"', "Cache-Control": "private, no-store" } });
}
