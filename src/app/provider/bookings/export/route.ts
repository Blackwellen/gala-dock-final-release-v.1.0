import { NextResponse, type NextRequest } from "next/server";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";

const csv = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** CSV of the workspace's bookings for the current tab/search. RLS-scoped; no payment instruments are included. */
export async function GET(request: NextRequest) {
  const { db, workspace } = await getProvider();
  const tab = request.nextUrl.searchParams.get("tab") ?? "upcoming", q = (request.nextUrl.searchParams.get("q") ?? "").toLowerCase();
  const now = Date.now();
  const all = await rows<Record<string, string | number | null>>(db.from("provider_jobs").select("reference,event_name,client_name,client_org,mode,location,starts_at,ends_at,guests,status,value,platform_fee,net_payout,paid_amount,payment_status,source").eq("workspace_id", workspace.id).order("starts_at"));
  const pick = all.filter(j => {
    const end = new Date(String(j.ends_at)).getTime();
    const inTab = tab === "active" ? j.status === "active" : tab === "cancelled" ? j.status === "cancelled" : tab === "past" ? ["completed", "no_show"].includes(String(j.status)) || end < now : ["confirmed", "held"].includes(String(j.status)) && end >= now;
    return inTab && (!q || [j.event_name, j.client_name, j.reference].some(v => String(v ?? "").toLowerCase().includes(q)));
  });
  const head = ["Reference", "Event", "Client", "Organisation", "Type", "Location", "Starts", "Ends", "Guests", "Status", "Value", "Platform fee", "Net payout", "Paid", "Payment status", "Source"];
  const body = pick.map(j => [j.reference, j.event_name, j.client_name, j.client_org, j.mode, j.location, j.starts_at, j.ends_at, j.guests, j.status, j.value, j.platform_fee, j.net_payout, j.paid_amount, j.payment_status, j.source].map(csv).join(","));
  return new NextResponse([head.join(","), ...body].join("\n"), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bookings-${tab}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
