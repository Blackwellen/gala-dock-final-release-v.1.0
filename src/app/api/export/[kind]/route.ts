import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`; // CSV-injection safe
const SOURCES = {
  proposals: { table: "proposals", cols: "number,title,client_name,status,version,total,valid_until,signature_status,deposit_status,created_at" },
  leads: { table: "leads", cols: "reference,name,client_name,stage,value,probability,expected_date,owner_name,source,created_at" },
  invoices: { table: "invoices", cols: "number,client_name,status,issue_date,due_date,subtotal,tax,total,amount_paid,currency" },
  transactions: { table: "transactions", cols: "occurred_at,description,kind,category,amount,status,source_type" },
} as const;

/** CSV export of the caller's RLS-visible rows. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params; const src = SOURCES[kind as keyof typeof SOURCES];
  if (!src) return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("last_workspace_id").eq("id", user.id).single();
  if (!prof?.last_workspace_id) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const { data, error } = await (supabase.from(src.table as "leads") as unknown as { select: (c: string) => { eq: (k: string, v: string) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> } } }).select(src.cols).eq("workspace_id", prof.last_workspace_id).limit(10000);
  if (error) return NextResponse.json({ error: "Export failed" }, { status: 500 });
  const cols = src.cols.split(","); const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="gala-dock-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" } });
}
