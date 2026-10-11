"use client";
import { Children, useEffect, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useAction } from "@/components/kit/client";
import { reorderBuild } from "@/lib/actions/build-extra";

/** Drag (pointer) or keyboard (grip + ↑/↓) reordering of build rows. Order is presentation only — it never changes bookings. */
export function SortableBuild({ eventId, ids, labels, children }: { eventId: string; ids: string[]; labels: string[]; children: ReactNode }) {
  const rows = Children.toArray(children);
  const [order, setOrder] = useState(ids.map((_, i) => i)); const [drag, setDrag] = useState<number | null>(null); const [msg, setMsg] = useState("");
  const { run } = useAction();
  // Reset the local order when the server sends a different list (adjusting state during render, not in an effect).
  const idsKey = ids.join(","); const [prevKey, setPrevKey] = useState(idsKey);
  if (prevKey !== idsKey) { setPrevKey(idsKey); setOrder(ids.map((_, i) => i)); }
  const commit = (next: number[]) => { setOrder(next); void run(() => reorderBuild(eventId, next.map(i => ids[i]!)), { refresh: false }); };
  const move = (pos: number, to: number) => { if (to < 0 || to >= order.length) return; const n = [...order]; const [x] = n.splice(pos, 1); n.splice(to, 0, x!); setMsg(`${labels[x!]} moved to position ${to + 1} of ${n.length}`); commit(n); };
  return <><ol className="cb-list">{order.map((ix, pos) => <li key={ids[ix]} className={`cb-row ${drag === pos ? "dragging" : ""}`} draggable onDragStart={e => { setDrag(pos); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDrag(null)} onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== pos) { const n = [...order]; const [x] = n.splice(drag, 1); n.splice(pos, 0, x!); setOrder(n); setDrag(pos); } }} onDrop={e => { e.preventDefault(); setDrag(null); commit(order); }}>
    <button type="button" className="cb-grip" aria-label={`Reorder ${labels[ix]}. Use arrow keys to move.`} title="Drag to reorder — doesn't change bookings" onKeyDown={e => { if (e.key === "ArrowUp") { e.preventDefault(); move(pos, pos - 1); } if (e.key === "ArrowDown") { e.preventDefault(); move(pos, pos + 1); } }}><GripVertical size={16} /></button>
    {rows[ix]}
  </li>)}</ol><p className="k-sr" aria-live="polite">{msg}</p></>;
}
