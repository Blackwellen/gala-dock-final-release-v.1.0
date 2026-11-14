/**
 * Guest-list CSV import (customer Guests & Tickets). Pure module, safe on client and server.
 * Handles what spreadsheet exports really contain: a UTF-8 byte-order mark before the first header (Excel), quoted fields with
 * commas, doubled quotes and line breaks, CRLF line ends and blank lines. The old `split(",")` read "﻿name" as the header
 * (so every row lacked a name and the whole import was refused) and split "Smith, Jane" into two columns.
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, ""); const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

/** Header row → one object per guest; plus_one accepts yes / y / true / 1 (any case). */
export function guestRowsFromCsv(text: string): Record<string, string | boolean>[] {
  const [head, ...lines] = parseCsv(text);
  const keys = (head ?? []).map(k => k.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  return lines.map(v => Object.fromEntries(keys.map((k, i) => [k, k === "plus_one" ? /^(y|yes|true|1)$/i.test((v[i] ?? "").trim()) : (v[i] ?? "").trim()])));
}
