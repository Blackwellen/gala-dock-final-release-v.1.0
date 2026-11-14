/** CSV cell for provider exports: neutralises spreadsheet formulas (=, +, -, @, tab, CR) unless the value is a plain number, and quotes when needed. */
export const csvCell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
