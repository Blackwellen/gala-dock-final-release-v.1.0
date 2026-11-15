import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders the legal pack's markdown (content/legal/*.md) as React elements — headings, paragraphs, lists (one nested level), tables,
 * **bold**, *italic*, `code` and [links](/path). No HTML is ever injected: every piece of text becomes a text node, so the output is
 * XSS-safe whatever the source contains. h2/h3 get stable ids for "On this page" and deep links.
 */
export const headingId = (t: string) => t.toLowerCase().replace(/\*\*|`/g, "").replace(/^\d+[a-z]?[.)]?\s*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) out.push(<b key={k}>{inline(m[1], k)}</b>);
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2], k)}</em>);
    else if (m[3] !== undefined) out.push(<code key={k}>{m[3]}</code>);
    else {
      const href = m[5]!;
      const label = inline(m[4]!, k);
      out.push(href.startsWith("/") ? <Link key={k} href={href}>{label}</Link>
        : /^https:\/\//.test(href) ? <a key={k} href={href} rel="noopener noreferrer" target="_blank">{label}</a> : <span key={k}>{label}</span>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());

export function LegalMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  const used = new Set<string>();
  const id = (t: string) => { let x = headingId(t); while (used.has(x)) x += "-x"; used.add(x); return x; };
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim() || /^---+$/.test(line.trim())) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length, text = h[2]!;
      blocks.push(level === 1 ? <h2 key={k++} id={id(text)}>{inline(text)}</h2> : level === 2 ? <h2 key={k++} id={id(text)}>{inline(text)}</h2> : <h3 key={k++} id={id(text)}>{inline(text)}</h3>);
      i++; continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) { rows.push(cells(lines[i]!)); i++; }
      blocks.push(<div key={k++} className="lg-table" role="region" aria-label="Table" tabIndex={0}><table>
        <thead><tr>{head.map((c, j) => <th key={j} scope="col">{inline(c, `h${j}`)}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `c${ri}-${j}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const bullet = /^(\s*)(?:-|\d+\.)\s+/;
    if (bullet.test(line) && !/^\d+\.\d/.test(line.trim())) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items: { text: string; children: string[] }[] = [];
      while (i < lines.length && bullet.test(lines[i]!) && !/^\d+\.\d/.test(lines[i]!.trim())) {
        const cur = lines[i]!;
        if (/^\s{2,}/.test(cur) && items.length) items[items.length - 1]!.children.push(cur.replace(bullet, ""));
        else items.push({ text: cur.replace(bullet, ""), children: [] });
        i++;
      }
      const lis = items.map((it, j) => <li key={j}>{inline(it.text, `l${j}`)}{it.children.length > 0 && <ul>{it.children.map((c, ci) => <li key={ci}>{inline(c, `l${j}-${ci}`)}</li>)}</ul>}</li>);
      blocks.push(ordered ? <ol key={k++}>{lis}</ol> : <ul key={k++}>{lis}</ul>);
      continue;
    }
    // Paragraph: consecutive non-blank lines that don't start another block.
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^#{1,3}\s/.test(lines[i]!) && !lines[i]!.trim().startsWith("|") && !(para.length && bullet.test(lines[i]!) && !/^\d+\.\d/.test(lines[i]!.trim()))) { para.push(lines[i]!.trim()); i++; }
    if (para.length) blocks.push(<p key={k++}>{inline(para.join(" "))}</p>);
    else i++;
  }
  return <>{blocks}</>;
}
