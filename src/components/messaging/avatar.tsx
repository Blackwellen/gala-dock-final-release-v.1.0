import Link from "next/link";
import "@/styles/messaging-drop.css";
import { relative } from "@/lib/format";

const TONES = ["#0038fd", "#7c3aed", "#0f9d74", "#d9480f", "#c2255c", "#1971c2", "#5f3dc4", "#2b8a3e"];
const initials = (name: string) => name.split(/[\s,·&-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

/** Picture or coloured initials — used for people and businesses everywhere in messaging. */
export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const tone = TONES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONES.length];
  return <span className="ms-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: src ? undefined : tone }} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src ? <img src={src} alt="" /> : initials(name)}</span>;
}

/** Recent conversations for any top-bar Messages dropdown. */
export function RecentMessages({ items, inbox, onPick, empty = "No conversations yet." }: {
  items: { id: string; name: string; avatar: string | null; subject: string; preview: string; at: string; unread: boolean; href: string }[]; inbox: string; onPick?: () => void; empty?: string }) {
  return <div className="ms-drop">
    {items.length ? items.map(c => <Link key={c.id} role="menuitem" href={c.href} onClick={onPick} className={`ms-drop-item ${c.unread ? "unread" : ""}`}>
      <Avatar name={c.name} src={c.avatar} size={38} />
      <span className="ms-drop-body"><span className="ms-drop-top"><b>{c.name}</b><time dateTime={c.at}>{relative(c.at)}</time></span>
        <small>{c.subject ? `${c.subject} · ` : ""}{c.preview}</small></span>
      {c.unread && <i className="ms-drop-dot" aria-label="Unread" />}</Link>) : <p className="ms-drop-empty">{empty}</p>}
    <Link href={inbox} className="ms-drop-all" onClick={onPick}>Open inbox</Link>
  </div>;
}
