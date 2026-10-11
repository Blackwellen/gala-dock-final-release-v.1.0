import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { loadPrintable } from "@/lib/tickets/printable";

const fmt = (iso: string | null, tz: string, o: Intl.DateTimeFormatOptions) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).format(new Date(iso)) : "To be confirmed";
// Helvetica (WinAnsi) can't encode every character; keep the printable text safe.
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[–—]/g, "-").replace(/[^\x20-\x7E£€]/g, "");

/** Printable PDF ticket (user addition + media §79): event details, holder, seat, order ref, terms and the static print credential. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadPrintable(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: { "Cache-Control": "private, no-store" } });
  const t = r.t;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${t.event.name} — ticket ${t.code}`); pdf.setAuthor("Gala Dock"); pdf.setCreator("Gala Dock");
  const page = pdf.addPage([595.28, 841.89]); // A4
  const [regular, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  const ink = rgb(0.035, 0.04, 0.32), sub = rgb(0.29, 0.31, 0.65), brand = rgb(0, 0.22, 0.99), line = rgb(0.9, 0.92, 0.97);
  const W = 595.28, M = 48;
  // Header band
  page.drawRectangle({ x: 0, y: 841.89 - 110, width: W, height: 110, color: ink });
  page.drawText("GALA DOCK", { x: M, y: 841.89 - 46, size: 12, font: bold, color: rgb(0.72, 0.78, 1) });
  page.drawText(safe(t.event.name).slice(0, 48), { x: M, y: 841.89 - 80, size: 24, font: bold, color: rgb(1, 1, 1) });
  // Ticket card
  const top = 841.89 - 140;
  page.drawRectangle({ x: M, y: top - 400, width: W - 2 * M, height: 400, borderColor: line, borderWidth: 1.2, color: rgb(1, 1, 1) });
  const qr = await pdf.embedPng(t.qrPng);
  page.drawImage(qr, { x: W - M - 230, y: top - 270, width: 210, height: 210 });
  page.drawText(safe(t.code), { x: W - M - 230 + 105 - bold.widthOfTextAtSize(safe(t.code), 12) / 2, y: top - 290, size: 12, font: bold, color: ink });
  const rows: [string, string][] = [
    ["Date", fmt(t.event.startsAt, t.event.timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" })],
    ["Time", `${fmt(t.event.startsAt, t.event.timezone, { hour: "2-digit", minute: "2-digit" })}${t.event.endsAt ? ` - ${fmt(t.event.endsAt, t.event.timezone, { hour: "2-digit", minute: "2-digit" })}` : ""}`],
    ["Venue", [t.event.venue, t.event.address].filter(Boolean).join(", ") || "To be confirmed"],
    ["Ticket holder", t.attendee || "Ticket holder"], ["Ticket", t.tier], ...(t.seat ? [["Seat", t.seat] as [string, string]] : []), ["Order reference", t.orderRef],
  ];
  let y = top - 40;
  for (const [k, v] of rows) {
    page.drawText(k.toUpperCase(), { x: M + 20, y, size: 8.5, font: bold, color: sub });
    const text = safe(v); const lines = text.length > 38 ? [text.slice(0, 38), text.slice(38, 76)] : [text];
    lines.forEach((l, i) => page.drawText(l, { x: M + 20, y: y - 15 - i * 14, size: 12.5, font: regular, color: ink }));
    y -= 32 + (lines.length - 1) * 14;
  }
  page.drawLine({ start: { x: M + 20, y: top - 330 }, end: { x: W - M - 20, y: top - 330 }, thickness: 1, color: line, dashArray: [4, 4] });
  page.drawText("Show this code at the entrance. It is unique to this ticket — copies are refused once scanned.", { x: M + 20, y: top - 352, size: 9.5, font: regular, color: sub });
  page.drawText(`Printed ${new Date().toISOString().slice(0, 10)} · Ticket ${safe(t.code)}`, { x: M + 20, y: top - 372, size: 8.5, font: regular, color: sub });
  // Terms
  let ty = top - 440;
  page.drawText("TERMS", { x: M, y: ty, size: 9, font: bold, color: sub }); ty -= 16;
  const words = safe(t.event.terms).split(/\s+/); let lineTxt = "";
  for (const w of words) {
    if (regular.widthOfTextAtSize(`${lineTxt} ${w}`, 9.5) > W - 2 * M) { page.drawText(lineTxt.trim(), { x: M, y: ty, size: 9.5, font: regular, color: ink }); ty -= 13; lineTxt = ""; }
    lineTxt += ` ${w}`;
  }
  if (lineTxt.trim()) page.drawText(lineTxt.trim(), { x: M, y: ty, size: 9.5, font: regular, color: ink });
  page.drawText("galadock.com", { x: M, y: 36, size: 9, font: bold, color: brand });
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="ticket-${t.code}.pdf"`, "Cache-Control": "private, no-store" } });
}
