import { NextResponse, type NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin/context";
import { reportCsv, reportXml, type ReportRow } from "@/lib/tax/platform-reporting";

/**
 * Q74 (D7): annual UK platform-reporting export (PORR 2023) — CSV, or an XML-ready draft. Commerce permission on an aal2 admin
 * session (the RPC re-checks); every download is audited. Sensitive (TINs, dates of birth): never cached.
 */
export async function GET(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin.permissions.has("commerce")) return NextResponse.json({ error: "Commerce permission required." }, { status: 403 });
  const year = Number(request.nextUrl.searchParams.get("year")), format = request.nextUrl.searchParams.get("format") === "xml" ? "xml" : "csv";
  if (!Number.isInteger(year) || year < 2024 || year > new Date().getUTCFullYear()) return NextResponse.json({ error: "Choose a reporting year." }, { status: 400 });
  const { data, error } = await admin.db.rpc("admin_platform_reporting_report" as never, { p_year: year } as never);
  if (error) return NextResponse.json({ error: /not_authorized/.test(error.message) ? "Verify with MFA first." : "Couldn’t build the report." }, { status: /not_authorized/.test(error.message) ? 403 : 500 });
  const rows = (data ?? []) as ReportRow[];
  await admin.db.rpc("admin_platform_reporting_export_logged" as never, { p_year: year, p_format: format, p_rows: rows.length } as never);
  const body = format === "xml" ? reportXml(year, rows) : reportCsv(rows);
  return new NextResponse(body, { headers: {
    "Content-Type": format === "xml" ? "application/xml; charset=utf-8" : "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="gala-dock-platform-reporting-${year}.${format}"`,
    "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
  } });
}
