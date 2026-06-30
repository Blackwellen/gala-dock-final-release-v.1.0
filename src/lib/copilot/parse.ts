// Gala Dock — slash command parser. "/create-task title:"Order flowers" event:abc due:2026-07-01"
// → { id: "create-task", args: { title: "Order flowers", event: "abc", due: "2026-07-01" } }.
// Free text with no key lands in args._. Pure + safe on client and server.

export interface ParsedCommand {
  id: string;
  args: Record<string, string>;
}

export function parseSlash(text: string): ParsedCommand | null {
  const m = text.trim().match(/^\/([a-z][a-z-]*)\s*(.*)$/i);
  if (!m) return null;
  const id = m[1].toLowerCase();
  const rest = m[2] ?? "";
  const args: Record<string, string> = {};

  const re = /([a-zA-Z_]+):("([^"]*)"|[^\s]+)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(rest)) !== null) {
    args[mm[1]] = mm[3] !== undefined ? mm[3] : mm[2];
  }
  const free = rest.replace(re, "").trim();
  if (free) args._ = free;

  return { id, args };
}
